"""
Email Monitor — Gmail polling service that stores analyzed results in Supabase.

Polls Gmail for new emails, analyzes them with Claude, and upserts
results into the Supabase `analyzed_emails` table.

Usage:
    from backend.email_monitor import EmailMonitor
    monitor = EmailMonitor()
    results = await monitor.scan_user_emails(user_id, access_token, refresh_token, school_names)
"""

import base64
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests
from supabase import create_client, Client as SupabaseClient

from backend.email_analyzer import analyze_email
from backend.google_oauth import load_gmail_oauth_credentials

logger = logging.getLogger(__name__)

GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1"


def _classify_obligation_type(text: str) -> str:
    """
    Minimal, rule-based classifier for the Phase 1 spine.
    Correct routing > correctness. Default to APPLICATION_SUBMISSION.
    """
    t = (text or "").lower()

    if "fafsa" in t or "fsa id" in t:
        return "FAFSA"
    if "scholarship" in t or "grant" in t:
        return "SCHOLARSHIP"
    if ("housing" in t and "deposit" in t) or "housing deposit" in t:
        return "HOUSING_DEPOSIT"
    if ("application" in t and "fee" in t) or "application fee" in t:
        return "APPLICATION_FEE"

    return "APPLICATION_SUBMISSION"


def _proof_required_for_type(obligation_type: str) -> bool:
    # Phase 1: conservative defaults; proof storage is out of scope.
    return obligation_type in {"FAFSA", "APPLICATION_FEE", "HOUSING_DEPOSIT"}


def _build_obligation_title(subject: str, analysis: Dict[str, Any]) -> str:
    # Prefer explicit action wording; fall back to summary/subject.
    title = (analysis.get("action_needed") or analysis.get("summary") or subject or "").strip()
    if not title:
        return "Follow up"
    return title[:200]


def _get_supabase() -> SupabaseClient:
    """Create Supabase admin client using service role or anon key."""
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_ variants) must be set")
    return create_client(url, key)


def _refresh_gmail_token(refresh_token: str) -> Optional[Dict[str, Any]]:
    """Refresh a Gmail OAuth access token."""
    try:
        client_id, client_secret = load_gmail_oauth_credentials()
    except Exception as e:
        logger.error("Gmail OAuth client credentials not configured for token refresh: %s", e)
        return None

    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })

    if resp.status_code != 200:
        logger.error(f"Token refresh failed: {resp.text}")
        return None

    data = resp.json()
    return {
        "access_token": data["access_token"],
        "expires_in": data.get("expires_in", 3600),
    }


def _fetch_gmail_messages(access_token: str, max_results: int = 30) -> List[Dict]:
    """Fetch recent Gmail messages using the REST API."""
    headers = {"Authorization": f"Bearer {access_token}"}

    # List message IDs
    list_resp = requests.get(
        f"{GMAIL_API_BASE}/users/me/messages",
        headers=headers,
        params={"maxResults": max_results},
    )
    if list_resp.status_code == 401:
        raise PermissionError("Gmail access token expired")
    if list_resp.status_code != 200:
        raise Exception(f"Gmail API error: {list_resp.status_code} {list_resp.text}")

    message_ids = list_resp.json().get("messages", [])

    emails = []
    for msg_ref in message_ids:
        msg_resp = requests.get(
            f"{GMAIL_API_BASE}/users/me/messages/{msg_ref['id']}",
            headers=headers,
        )
        if msg_resp.status_code != 200:
            continue

        msg_data = msg_resp.json()
        headers_list = msg_data.get("payload", {}).get("headers", [])

        def get_header(name: str) -> str:
            for h in headers_list:
                if h["name"].lower() == name.lower():
                    return h["value"]
            return ""

        body = _extract_body(msg_data.get("payload", {}))

        emails.append({
            "gmail_id": msg_ref["id"],
            "subject": get_header("Subject"),
            "sender": get_header("From"),
            "date": get_header("Date"),
            "snippet": msg_data.get("snippet", ""),
            "body": body,
            "source_link": f"https://mail.google.com/mail/u/0/#inbox/{msg_ref['id']}",
        })

    return emails


def _extract_body(payload: Dict) -> str:
    """Extract plain-text body from Gmail API payload."""
    if "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            elif part.get("mimeType") == "multipart/alternative":
                return _extract_body(part)
    elif "body" in payload:
        data = payload["body"].get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    return ""


class EmailMonitor:
    """Polls Gmail and stores AI-analyzed results in Supabase."""

    def __init__(self):
        self.supabase = _get_supabase()

    def scan_user_emails(
        self,
        user_id: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        school_names: Optional[List[str]] = None,
        max_results: int = 30,
    ) -> Dict[str, Any]:
        """
        Scan a user's Gmail, analyze each email, and store results.

        Returns: {scanned: int, new: int, actionable: int, errors: int}
        """
        # Try to fetch emails; refresh token if expired
        try:
            emails = _fetch_gmail_messages(access_token, max_results)
        except PermissionError:
            if refresh_token:
                logger.info("Access token expired, refreshing...")
                refreshed = _refresh_gmail_token(refresh_token)
                if refreshed:
                    access_token = refreshed["access_token"]
                    # Update stored token
                    expiry = datetime.utcnow() + timedelta(seconds=refreshed.get("expires_in", 3600))
                    self.supabase.table("email_connections").update({
                        "access_token": access_token,
                        "token_expiry": expiry.isoformat(),
                    }).eq("user_id", user_id).execute()
                    emails = _fetch_gmail_messages(access_token, max_results)
                else:
                    return {"scanned": 0, "new": 0, "actionable": 0, "errors": 1, "error": "Token refresh failed"}
            else:
                return {"scanned": 0, "new": 0, "actionable": 0, "errors": 1, "error": "Token expired, no refresh token"}

        # Get existing gmail_ids to skip already-analyzed emails
        existing = self.supabase.table("analyzed_emails") \
            .select("gmail_id") \
            .eq("user_id", user_id) \
            .execute()
        existing_ids = {row["gmail_id"] for row in (existing.data or [])}

        new_count = 0
        actionable_count = 0
        error_count = 0

        for email in emails:
            if email["gmail_id"] in existing_ids:
                continue  # Already analyzed

            try:
                analysis = analyze_email(
                    subject=email["subject"],
                    sender=email["sender"],
                    date=email["date"],
                    body=email["body"],
                    schools=school_names,
                )

                row = {
                    "user_id": user_id,
                    "gmail_id": email["gmail_id"],
                    "subject": email["subject"][:500],
                    "sender": email["sender"][:200],
                    "received_at": email["date"],
                    "snippet": email["snippet"][:500],
                    "source_link": email["source_link"],
                    "requires_action": analysis["requires_action"],
                    "summary": analysis["summary"],
                    "action_needed": analysis["action_needed"],
                    # Phase 1 doctrine: deadlines are canonical only in `obligations`.
                    # Keep analyzed_emails as signals-only and do not store deadlines here.
                    "deadline": None,
                    "deadline_implied": analysis["deadline_implied"],
                    "relevance": analysis["relevance"],
                    "category": analysis["category"],
                    "school_match": analysis["school_match"],
                }

                self.supabase.table("analyzed_emails").insert(row).execute()
                new_count += 1
                if analysis["requires_action"]:
                    actionable_count += 1

                # Phase 1 spine: route actionable intent into canonical `obligations`.
                should_create_obligation = bool(analysis.get("deadline") or analysis.get("requires_action") or analysis.get("action_needed"))
                if should_create_obligation:
                    try:
                        text_for_classification = " ".join([
                            email.get("subject", ""),
                            analysis.get("summary", "") or "",
                            analysis.get("action_needed", "") or "",
                            email.get("body", "") or "",
                        ])
                        obligation_type = _classify_obligation_type(text_for_classification)
                        title = _build_obligation_title(email.get("subject", ""), analysis)
                        obligation_row = {
                            "user_id": user_id,
                            "type": obligation_type,
                            "title": title,
                            "source": "email",
                            "source_ref": email["gmail_id"],
                            # Canonical deadline lives here.
                            "deadline": analysis.get("deadline"),
                            "status": "pending",
                            "proof_required": _proof_required_for_type(obligation_type),
                        }
                        self.supabase.table("obligations").upsert(
                            obligation_row,
                            on_conflict="user_id,source,source_ref",
                        ).execute()
                    except Exception as e:
                        # Do not fail the scan if obligations wiring is broken.
                        logger.error("Failed to upsert obligation for email %s: %s", email.get("gmail_id"), e)

            except Exception as e:
                logger.error(f"Error processing email {email['gmail_id']}: {e}")
                error_count += 1

        # Update last_scan_at
        self.supabase.table("email_connections").update({
            "last_scan_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

        logger.info(f"Scan complete for {user_id}: {len(emails)} scanned, {new_count} new, {actionable_count} actionable")

        return {
            "scanned": len(emails),
            "new": new_count,
            "actionable": actionable_count,
            "errors": error_count,
        }

    def get_user_connection(self, user_id: str) -> Optional[Dict]:
        """Get a user's email connection details."""
        result = self.supabase.table("email_connections") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .single() \
            .execute()
        return result.data if result.data else None
