"""
Email Sender - send emails via Gmail API using per-user OAuth tokens.

Deployment-friendly: do not rely on a local token.json file. Instead, provide
access_token (+ refresh_token recommended) from the user's stored email
connection record in Supabase.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime
from email.mime.text import MIMEText
from typing import Optional

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.google_oauth import load_gmail_oauth_credentials

logger = logging.getLogger(__name__)

FULL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]

TOKEN_URI = "https://oauth2.googleapis.com/token"


class EmailSender:
    """Send emails via Gmail API (token + optional refresh)."""

    def __init__(
        self,
        access_token: str,
        refresh_token: Optional[str] = None,
        token_expiry: Optional[str] = None,
    ):
        self._raw_access_token = access_token
        self._raw_refresh_token = refresh_token
        self._raw_token_expiry = token_expiry

        self._client_id, self._client_secret = load_gmail_oauth_credentials()
        self.creds = self._build_credentials()
        self.service = build("gmail", "v1", credentials=self.creds)

    def _build_credentials(self) -> Credentials:
        expiry = _parse_iso_datetime(self._raw_token_expiry) if self._raw_token_expiry else None

        creds = Credentials(
            token=self._raw_access_token,
            refresh_token=self._raw_refresh_token,
            token_uri=TOKEN_URI,
            client_id=self._client_id,
            client_secret=self._client_secret,
            scopes=FULL_SCOPES,
        )
        creds.expiry = expiry

        # If we know expiry and it's expired, refresh proactively.
        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())

        return creds

    @property
    def access_token(self) -> str:
        # After refresh(), creds.token contains the latest access token.
        return self.creds.token or self._raw_access_token

    @property
    def token_expiry(self) -> Optional[str]:
        if not self.creds.expiry:
            return None
        try:
            return self.creds.expiry.isoformat()
        except Exception:
            return None

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        from_email: Optional[str] = None,
    ) -> str:
        """
        Send an email via Gmail API.

        Returns: Gmail message ID
        """
        message = MIMEText(body)
        message["to"] = to
        message["subject"] = subject
        if from_email:
            message["from"] = from_email

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        sent = self.service.users().messages().send(userId="me", body={"raw": raw}).execute()

        logger.info("Email sent to %s, message ID: %s", to, sent.get("id"))
        return sent["id"]


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    """Parse ISO datetimes that may include a trailing 'Z'."""
    if not value:
        return None
    v = value.strip()
    try:
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        return datetime.fromisoformat(v)
    except Exception:
        return None

