# pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client fastapi uvicorn anthropic python-dotenv APScheduler msal requests

import os
import json
import base64
import uuid
import hmac
import hashlib
import time
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from anthropic import Anthropic
from dotenv import load_dotenv
import uvicorn
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import re
import threading
import logging
from pathlib import Path
import msal
import requests

# ==================== CONFIGURATION ====================

load_dotenv()

# Configure logging. In production we prefer stdout; file logging can be enabled for local dev.
_log_handlers = [logging.StreamHandler()]
if os.getenv("LOG_TO_FILE", "").lower() in {"1", "true", "yes"}:
    _log_handlers.append(logging.FileHandler("obligo.log"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=_log_handlers,
)
logger = logging.getLogger('obligo')

app = FastAPI(title="Obligo API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://my-project-pied-rho-91.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gmail scopes: read emails for analysis + send drafts after user approval.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
scheduler = BackgroundScheduler()

# Outlook/Microsoft Graph configuration
OUTLOOK_SCOPES = ['Mail.Read', 'User.Read', 'offline_access']
OUTLOOK_AUTHORITY = 'https://login.microsoftonline.com/common'
OUTLOOK_GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0'

# ==================== PYDANTIC MODELS ====================

class EmailRequest(BaseModel):
    email_text: str

class ObligationResponse(BaseModel):
    requires_action: bool
    summary: Optional[str] = "TBD"
    action: Optional[str] = "TBD"
    deadline: Optional[str] = "TBD"
    deadline_implied: Optional[bool] = False
    stakes: Optional[str] = "TBD"
    authority: Optional[str] = "TBD"
    blocking: Optional[bool] = False

class MicroActionRequest(BaseModel):
    obligation_id: str
    approval_status: str
    user_notes: Optional[str] = ""

class ActionStep(BaseModel):
    step_id: int
    description: str
    url: Optional[str] = None
    estimated_minutes: int = 5
    completed: bool = False

class ActionPlan(BaseModel):
    obligation_id: str
    title: str
    steps: List[ActionStep]
    total_estimated_minutes: int

# In-memory storage for action plans (replace with Supabase later)
action_plans_db: Dict[str, ActionPlan] = {}
execution_progress_db: Dict[str, Dict[int, bool]] = {}

class ActionLogEntry(BaseModel):
    timestamp: str
    user_id: str = "default_user"
    obligation_id: str
    action: str
    approval_status: str
    score: float
    notes: Optional[str] = ""

# ==================== HELPER FUNCTIONS ====================

def safe_print(text: str):
    """Safely print Unicode strings on Windows"""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode('ascii', 'ignore').decode('ascii'))

def normalize_value(value: Any, default: str = "TBD") -> str:
    """Normalize values to handle None, null, empty strings"""
    if value is None or value == "null" or value == "" or str(value).strip() == "":
        return default
    return str(value).strip()

def normalize_deadline(deadline: Any) -> str:
    """
    Normalize deadline to YYYY-MM-DD format or 'TBD'
    Handles: None, "null", invalid dates, relative dates
    """
    if not deadline or deadline == "null":
        return "TBD"

    deadline_str = str(deadline).strip().lower()

    # Handle common relative dates
    today = datetime.now()
    if "today" in deadline_str:
        return today.strftime("%Y-%m-%d")
    if "tomorrow" in deadline_str:
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")
    if "next week" in deadline_str:
        return (today + timedelta(days=7)).strftime("%Y-%m-%d")

    # Try to parse as date
    try:
        # Try ISO format first
        date_obj = datetime.fromisoformat(deadline_str)
        return date_obj.strftime("%Y-%m-%d")
    except:
        pass

    # Try common date formats
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y"]:
        try:
            date_obj = datetime.strptime(deadline_str, fmt)
            return date_obj.strftime("%Y-%m-%d")
        except:
            continue

    # If all parsing fails, return TBD
    return "TBD"

def log_action(obligation_id: str, action: str, approval_status: str, score: float, notes: str = ""):
    """
    Log action to JSON file (Supabase integration ready)
    TODO: Replace with Supabase insert when ready
    """
    entry = ActionLogEntry(
        timestamp=datetime.now().isoformat(),
        user_id="default_user",
        obligation_id=obligation_id,
        action=action,
        approval_status=approval_status,
        score=score,
        notes=notes
    )

    # Read existing logs
    log_file = Path("action_log.json")
    logs = []
    if log_file.exists():
        try:
            with open(log_file, 'r') as f:
                logs = json.load(f)
        except json.JSONDecodeError:
            logger.warning("action_log.json is corrupted, creating new log")
            logs = []

    # Append new entry
    logs.append(entry.dict())

    # Write back
    with open(log_file, 'w') as f:
        json.dump(logs, f, indent=2)

    logger.info(f"Action logged: {obligation_id} - {approval_status}")

    # TODO: Insert into Supabase
    # supabase.table('action_logs').insert(entry.dict()).execute()

def get_demo_obligations() -> List[Dict]:
    # ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
    # Demo obligations are legacy fallback only. Do not extend this model.
    # Canonical work items must be stored in Supabase `obligations`.
    """Return demo obligations for testing/fallback"""
    return [
        {
            "obligation_id": "demo_1",
            "summary": "Complete project proposal for client meeting",
            "action": "Finalize and send the project proposal document",
            "deadline": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d"),
            "stakes": "Completing this on time keeps the project on track",
            "authority": "Client - ABC Corp",
            "blocking": True,
            "total_score": 45.5,
            "deadline_score": 10,
            "micro_action": "Open the draft and add final pricing details",
            "motivation": "This stands out because the client is expecting it soon.",
            "action_type": "email_draft",
            "prepared_content": "Hi Team,\n\nPlease find attached our project proposal...",
            "requires_approval": True,
            "safety_flags": [],
            "type": "application",
            "actionPath": [
                "Open the application portal or email",
                "Review required documents",
                "Prepare missing items"
            ],
            "sourceLink": "https://mail.google.com/mail/u/0/#inbox"
        },
        {
            "obligation_id": "demo_2",
            "summary": "Respond to professor about assignment extension",
            "action": "Email professor requesting deadline extension",
            "deadline": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "stakes": "This relates to your course grade",
            "authority": "Prof. Smith",
            "blocking": False,
            "total_score": 38.2,
            "deadline_score": 12,
            "micro_action": "Draft a brief, professional extension request email",
            "motivation": "A short email could help — worth considering today.",
            "action_type": "email_draft",
            "prepared_content": "Dear Professor Smith,\n\nI hope this email finds you well...",
            "requires_approval": True,
            "safety_flags": [],
            "type": "response",
            "actionPath": [
                "Open the email",
                "Draft a short reply",
                "Send confirmation or answer"
            ],
            "sourceLink": "https://mail.google.com/mail/u/0/#inbox"
        },
        {
            "obligation_id": "demo_3",
            "summary": "Review teammate's pull request",
            "action": "Review and provide feedback on PR #42",
            "deadline": (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d"),
            "stakes": "Your teammate is waiting on this review",
            "authority": "Team Lead",
            "blocking": True,
            "total_score": 35.8,
            "deadline_score": 6,
            "micro_action": "Open GitHub and review the code changes",
            "motivation": "This is blocking someone else — could be worth doing soon.",
            "action_type": "checklist",
            "prepared_content": "1. Review code changes\n2. Test locally\n3. Leave feedback",
            "requires_approval": False,
            "safety_flags": [],
            "type": "assignment",
            "actionPath": [
                "Open the assignment instructions",
                "Review requirements or rubric",
                "Start or upload the work"
            ],
            "sourceLink": "https://github.com/team/repo/pull/42"
        }
    ]

# ==================== GMAIL FUNCTIONS ====================

def get_gmail_service():
    """Get Gmail API service with OAuth"""
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def extract_email_body(payload):
    """Extract email body from Gmail API payload"""
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
            elif part['mimeType'] == 'multipart/alternative':
                return extract_email_body(part)
    elif 'body' in payload and 'data' in payload['body']:
        return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
    return ""

def get_header(headers, name):
    """Extract header value from Gmail headers"""
    for header in headers:
        if header['name'].lower() == name.lower():
            return header['value']
    return ""

def fetch_gmail_emails(max_results=50):
    """Fetch recent emails from Gmail"""
    try:
        service = get_gmail_service()
        results = service.users().messages().list(userId='me', maxResults=max_results).execute()
        messages = results.get('messages', [])

        emails = []
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()
            headers = msg_data['payload']['headers']

            emails.append({
                'id': msg['id'],
                'subject': get_header(headers, 'Subject'),
                'sender': get_header(headers, 'From'),
                'date': get_header(headers, 'Date'),
                'full_text': extract_email_body(msg_data['payload']),
                'sourceLink': f"https://mail.google.com/mail/u/0/#inbox/{msg['id']}"
            })

        logger.info(f"Fetched {len(emails)} emails from Gmail")
        return emails
    except Exception as e:
        logger.error(f"Error fetching Gmail emails: {str(e)}")
        raise

# ==================== GMAIL OAUTH FUNCTIONS ====================

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _sign_oauth_state(payload: Dict[str, Any]) -> str:
    """Sign state payload so user_id can't be tampered with in the OAuth roundtrip."""
    secret = os.getenv("OAUTH_STATE_SECRET")
    if not secret:
        raise ValueError("OAUTH_STATE_SECRET not set")
    body = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return f"{body}.{_b64url_encode(sig)}"


def _verify_oauth_state(state: str, max_age_seconds: int = 10 * 60) -> Dict[str, Any]:
    secret = os.getenv("OAUTH_STATE_SECRET")
    if not secret:
        raise ValueError("OAUTH_STATE_SECRET not set")

    try:
        body_b64, sig_b64 = state.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    expected_sig = hmac.new(secret.encode("utf-8"), body_b64.encode("utf-8"), hashlib.sha256).digest()
    expected_sig_b64 = _b64url_encode(expected_sig)
    if not hmac.compare_digest(expected_sig_b64, sig_b64):
        raise HTTPException(status_code=400, detail="Invalid OAuth state signature")

    payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))
    ts = payload.get("ts")
    if isinstance(ts, (int, float)) and (time.time() - ts) > max_age_seconds:
        raise HTTPException(status_code=400, detail="OAuth state expired")

    return payload


def get_gmail_auth_url(state: Optional[str] = None) -> str:
    """Generate Gmail OAuth authorization URL for web flow."""
    import urllib.parse
    from backend.google_oauth import load_gmail_oauth_credentials, get_gmail_redirect_uri

    client_id, _client_secret = load_gmail_oauth_credentials()
    redirect_uri = get_gmail_redirect_uri()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if state:
        params["state"] = state

    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    logger.info("Generated Gmail OAuth URL")
    return auth_url

def exchange_gmail_code_for_tokens(auth_code: str) -> Dict[str, Any]:
    """Exchange Gmail authorization code for tokens."""
    from backend.google_oauth import load_gmail_oauth_credentials, get_gmail_redirect_uri

    client_id, client_secret = load_gmail_oauth_credentials()
    redirect_uri = get_gmail_redirect_uri()

    # Exchange code for tokens
    token_url = 'https://oauth2.googleapis.com/token'
    data = {
        'code': auth_code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code'
    }

    response = requests.post(token_url, data=data)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {response.text}")

    tokens = response.json()

    # Calculate expiration time
    expires_at = datetime.now() + timedelta(seconds=tokens.get('expires_in', 3600))

    # Best-effort: fetch the Gmail address for display / debugging.
    email_address = None
    try:
        profile_resp = requests.get(
            "https://www.googleapis.com/gmail/v1/users/me/profile",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        if profile_resp.status_code == 200:
            email_address = (profile_resp.json() or {}).get("emailAddress")
    except Exception:
        pass

    return {
        'access_token': tokens['access_token'],
        'refresh_token': tokens.get('refresh_token'),
        'expires_at': expires_at.isoformat(),
        'email': email_address
    }

def save_gmail_credentials(user_id: str, email: str, access_token: str, refresh_token: str, expires_at: str):
    """Legacy: save Gmail OAuth credentials to token.json (single-user local dev)."""
    cred_data = {
        'token': access_token,
        'refresh_token': refresh_token,
        'token_uri': 'https://oauth2.googleapis.com/token',
        'client_id': None,
        'client_secret': None,
        'scopes': SCOPES
    }

    # Load client info from credentials.json
    try:
        from backend.google_oauth import load_gmail_oauth_credentials
        cred_data['client_id'], cred_data['client_secret'] = load_gmail_oauth_credentials()
    except Exception:
        # Keep legacy behavior if credentials are not configured via env.
        if os.path.exists('credentials.json'):
            with open('credentials.json', 'r') as f:
                creds = json.load(f)
                cred_type = 'web' if 'web' in creds else 'installed'
                cred_data['client_id'] = creds[cred_type]['client_id']
                cred_data['client_secret'] = creds[cred_type]['client_secret']

    # Save to token.json
    with open('token.json', 'w') as f:
        json.dump(cred_data, f)

    logger.info(f"Gmail credentials saved for user {user_id}")

# ==================== OUTLOOK/MICROSOFT GRAPH FUNCTIONS ====================

def get_outlook_auth_url() -> str:
    """Generate Microsoft OAuth authorization URL"""
    client_id = os.getenv('OUTLOOK_CLIENT_ID')
    redirect_uri = os.getenv('OUTLOOK_REDIRECT_URI')

    if not client_id or not redirect_uri:
        raise ValueError("OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI must be set in .env")

    # Build authorization URL
    auth_url = (
        f"{OUTLOOK_AUTHORITY}/oauth2/v2.0/authorize?"
        f"client_id={client_id}&"
        f"response_type=code&"
        f"redirect_uri={redirect_uri}&"
        f"response_mode=query&"
        f"scope={' '.join(OUTLOOK_SCOPES)}"
    )

    logger.info("Generated Outlook OAuth URL")
    return auth_url

def exchange_outlook_code_for_tokens(auth_code: str) -> Dict[str, Any]:
    """
    Exchange authorization code for access and refresh tokens
    Returns dict with: access_token, refresh_token, expires_at
    """
    client_id = os.getenv('OUTLOOK_CLIENT_ID')
    client_secret = os.getenv('OUTLOOK_CLIENT_SECRET')
    redirect_uri = os.getenv('OUTLOOK_REDIRECT_URI')

    if not all([client_id, client_secret, redirect_uri]):
        raise ValueError("OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, and OUTLOOK_REDIRECT_URI must be set")

    # Create MSAL confidential client app
    app = msal.ConfidentialClientApplication(
        client_id,
        authority=OUTLOOK_AUTHORITY,
        client_credential=client_secret
    )

    # Acquire token by authorization code
    # Only pass resource scopes, not OIDC scopes (MSAL handles offline_access automatically)
    resource_scopes = ['Mail.Read', 'User.Read']
    result = app.acquire_token_by_authorization_code(
        auth_code,
        scopes=resource_scopes,
        redirect_uri=redirect_uri
    )

    if "access_token" not in result:
        error_msg = result.get("error_description", result.get("error", "Unknown error"))
        logger.error(f"Failed to acquire token: {error_msg}")
        raise HTTPException(status_code=400, detail=f"Token acquisition failed: {error_msg}")

    # Calculate expiration timestamp
    expires_in = result.get('expires_in', 3600)
    expires_at = datetime.now() + timedelta(seconds=expires_in)

    logger.info("Successfully exchanged auth code for tokens")

    return {
        'access_token': result['access_token'],
        'refresh_token': result.get('refresh_token'),
        'expires_at': expires_at.isoformat(),
        'email': result.get('id_token_claims', {}).get('preferred_username', 'unknown@outlook.com')
    }

def refresh_outlook_token(refresh_token: str) -> Dict[str, Any]:
    """
    Refresh expired Outlook access token
    Returns new access_token and expires_at
    """
    client_id = os.getenv('OUTLOOK_CLIENT_ID')
    client_secret = os.getenv('OUTLOOK_CLIENT_SECRET')

    if not all([client_id, client_secret]):
        raise ValueError("OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET must be set")

    app = msal.ConfidentialClientApplication(
        client_id,
        authority=OUTLOOK_AUTHORITY,
        client_credential=client_secret
    )

    result = app.acquire_token_by_refresh_token(
        refresh_token,
        scopes=OUTLOOK_SCOPES
    )

    if "access_token" not in result:
        error_msg = result.get("error_description", "Token refresh failed")
        logger.error(f"Failed to refresh token: {error_msg}")
        raise HTTPException(status_code=401, detail=f"Token refresh failed: {error_msg}")

    expires_in = result.get('expires_in', 3600)
    expires_at = datetime.now() + timedelta(seconds=expires_in)

    logger.info("Successfully refreshed Outlook token")

    return {
        'access_token': result['access_token'],
        'refresh_token': result.get('refresh_token', refresh_token),  # Use new refresh token if provided
        'expires_at': expires_at.isoformat()
    }

def save_outlook_credentials(user_id: str, email: str, access_token: str, refresh_token: str, expires_at: str):
    """
    Save Outlook credentials to local JSON file
    TODO: Replace with Supabase insert into email_accounts table
    """
    credentials_file = Path("outlook_credentials.json")

    credentials = {
        'user_id': user_id,
        'provider': 'outlook',
        'email': email,
        'access_token': access_token,
        'refresh_token': refresh_token,
        'expires_at': expires_at,
        'created_at': datetime.now().isoformat()
    }

    # For now, just save to file (single user)
    with open(credentials_file, 'w') as f:
        json.dump(credentials, f, indent=2)

    logger.info(f"Saved Outlook credentials for {email}")

    # TODO: Insert into Supabase
    # supabase.table('email_accounts').insert({
    #     'user_id': user_id,
    #     'provider': 'outlook',
    #     'email': email,
    #     'access_token': access_token,
    #     'refresh_token': refresh_token,
    #     'expires_at': expires_at
    # }).execute()

def load_outlook_credentials() -> Optional[Dict[str, Any]]:
    """
    Load Outlook credentials from local JSON file
    TODO: Replace with Supabase query
    """
    credentials_file = Path("outlook_credentials.json")

    if not credentials_file.exists():
        return None

    try:
        with open(credentials_file, 'r') as f:
            creds = json.load(f)

        # Check if token is expired and refresh if needed
        expires_at = datetime.fromisoformat(creds['expires_at'])
        if datetime.now() >= expires_at - timedelta(minutes=5):  # Refresh 5 min before expiry
            logger.info("Outlook token expired, refreshing...")
            new_tokens = refresh_outlook_token(creds['refresh_token'])
            creds['access_token'] = new_tokens['access_token']
            creds['refresh_token'] = new_tokens['refresh_token']
            creds['expires_at'] = new_tokens['expires_at']

            # Save updated credentials
            with open(credentials_file, 'w') as f:
                json.dump(creds, f, indent=2)

        return creds

    except Exception as e:
        logger.error(f"Error loading Outlook credentials: {str(e)}")
        return None

def fetch_outlook_messages(access_token: str, max_results: int = 50) -> List[Dict[str, Any]]:
    """
    Fetch recent email metadata from Outlook using Microsoft Graph API
    Only fetches metadata fields (no full body content)
    """
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    # Request only metadata fields
    params = {
        '$top': max_results,
        '$select': 'id,subject,from,receivedDateTime,bodyPreview,webLink',
        '$orderby': 'receivedDateTime desc'
    }

    try:
        response = requests.get(
            f"{OUTLOOK_GRAPH_ENDPOINT}/me/messages",
            headers=headers,
            params=params
        )

        if response.status_code == 401:
            logger.error("Outlook access token expired or invalid")
            raise HTTPException(status_code=401, detail="Outlook token expired")

        response.raise_for_status()
        data = response.json()

        messages = data.get('value', [])
        logger.info(f"Fetched {len(messages)} messages from Outlook")

        return messages

    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching Outlook messages: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch Outlook messages: {str(e)}")

def normalize_outlook_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Outlook message to Obligo's internal format
    Matches Gmail normalization format for frontend compatibility
    """
    # Extract sender email
    from_field = message.get('from', {})
    sender_email = from_field.get('emailAddress', {})
    sender = f"{sender_email.get('name', 'Unknown')} <{sender_email.get('address', 'unknown@outlook.com')}>"

    # Parse received datetime
    received_dt = message.get('receivedDateTime', '')
    try:
        received_at = datetime.fromisoformat(received_dt.replace('Z', '+00:00'))
    except:
        received_at = datetime.now()

    return {
        'source': 'outlook',
        'emailId': message.get('id', ''),
        'subject': message.get('subject', 'No Subject'),
        'sender': sender,
        'snippet': message.get('bodyPreview', '')[:200],  # Limit snippet to 200 chars
        'receivedAt': received_at,
        'sourceLink': message.get('webLink', ''),
        'full_text': message.get('bodyPreview', '')  # Use preview as full_text for analysis
    }

# ==================== CLAUDE AI FUNCTIONS ====================

def analyze_email_with_claude(email_text: str) -> Dict:
    """
    Analyze email with Claude AI
    Returns normalized obligation with TBD defaults for missing fields
    """
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        client = Anthropic(api_key=api_key)

        prompt = f"""Analyze this email and determine if it contains something the reader may want to track or act on.

Email:
{email_text}

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{{
  "requires_action": true/false,
  "summary": "brief neutral description",
  "action": "what could be done",
  "deadline": "YYYY-MM-DD or 'TBD'",
  "deadline_implied": true/false,
  "stakes": "neutral description of what this relates to",
  "authority": "who sent this",
  "blocking": true/false
}}

Rules:
- If no deadline mentioned, use "TBD"
- If authority unclear, use "TBD"
- If no action needed, set requires_action: false
- Look for multiple items in one email
- Be concise, specific, and neutral in tone — describe facts, not pressure"""

        message = client.messages.create(
            model="claude-2.1",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text.strip()
        obligation = json.loads(response_text)

        # Normalize all fields with defaults
        normalized = {
            "requires_action": obligation.get("requires_action", False),
            "summary": normalize_value(obligation.get("summary"), "No summary"),
            "action": normalize_value(obligation.get("action"), "Review email"),
            "deadline": normalize_deadline(obligation.get("deadline")),
            "deadline_implied": obligation.get("deadline_implied", False),
            "stakes": normalize_value(obligation.get("stakes"), "Unknown impact"),
            "authority": normalize_value(obligation.get("authority"), "Unknown sender"),
            "blocking": obligation.get("blocking", False)
        }

        logger.info(f"Analyzed email: {normalized['summary'][:50]}...")
        return normalized

    except json.JSONDecodeError as e:
        logger.error(f"Claude returned invalid JSON: {e}")
        return {
            "requires_action": False,
            "summary": "Parse error",
            "action": "TBD",
            "deadline": "TBD",
            "stakes": "TBD",
            "authority": "TBD",
            "blocking": False
        }
    except Exception as e:
        logger.error(f"Error analyzing email with Claude: {str(e)}")
        raise

# ==================== OBLIGATION CLASSIFICATION & ACTION PATHS ====================

def classify_obligation_type(obligation: dict) -> str:
    """
    Classify obligation into types based on keyword matching.
    Types: assignment, response, application, unknown

    Rules:
    - assignment: submit, assignment, homework, lab, project, due, grade
    - response: reply, respond, let me know, answer, feedback, get back
    - application: application, documents, portal, form, register, enroll
    - unknown: default fallback
    """
    # Combine subject, summary, and action for keyword matching
    text = " ".join([
        obligation.get('summary', ''),
        obligation.get('action', ''),
        obligation.get('stakes', '')
    ]).lower()

    # Assignment keywords
    assignment_keywords = ['submit', 'assignment', 'homework', 'lab', 'project',
                          'due', 'grade', 'exam', 'quiz', 'paper', 'essay',
                          'deliverable', 'milestone']

    # Response keywords
    response_keywords = ['reply', 'respond', 'let me know', 'answer', 'feedback',
                        'get back', 'confirm', 'rsvp', 'update me', 'reach out']

    # Application keywords
    application_keywords = ['application', 'documents', 'portal', 'form',
                           'register', 'enroll', 'apply', 'transcript',
                           'recommendation', 'visa', 'admission']

    # Check for matches (order matters: most specific first)
    if any(keyword in text for keyword in assignment_keywords):
        return 'assignment'
    elif any(keyword in text for keyword in response_keywords):
        return 'response'
    elif any(keyword in text for keyword in application_keywords):
        return 'application'
    else:
        return 'unknown'

def get_action_path(obligation_type: str) -> list:
    """
    Return hardcoded action path steps based on obligation type.
    These are simple, clear steps a student can follow.
    No AI. No dynamic generation.
    """
    action_paths = {
        'assignment': [
            "Open the assignment instructions",
            "Review requirements or rubric",
            "Start or upload the work"
        ],
        'response': [
            "Open the email",
            "Draft a short reply",
            "Send confirmation or answer"
        ],
        'application': [
            "Open the application portal or email",
            "Review required documents",
            "Prepare missing items"
        ],
        'unknown': [
            "Open the email",
            "Read carefully",
            "Decide next step"
        ]
    }

    return action_paths.get(obligation_type, action_paths['unknown'])

# ==================== SCORING FUNCTIONS ====================

def calculate_deadline_score(deadline_str: str) -> int:
    """Calculate urgency score based on deadline"""
    if deadline_str == "TBD" or not deadline_str:
        return 5

    try:
        deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
        today = datetime.now()
        days_until = (deadline - today).days

        if days_until < 0: return 15      # Overdue
        if days_until == 0: return 12     # Today
        if days_until <= 1: return 10     # Tomorrow
        if days_until <= 3: return 8      # This week
        if days_until <= 7: return 6      # Next week
        if days_until <= 14: return 4     # Two weeks
        return 2                           # Future
    except:
        return 5

def calculate_authority_score(authority_str: str) -> int:
    """Calculate score based on authority level"""
    if not authority_str or authority_str == "TBD":
        return 3

    authority_lower = authority_str.lower()

    if any(word in authority_lower for word in ['professor', 'prof', 'dr.', 'dean']):
        return 10
    elif any(word in authority_lower for word in ['manager', 'supervisor', 'boss', 'ceo', 'director']):
        return 10
    elif any(word in authority_lower for word in ['admin', 'administration', 'registrar']):
        return 9
    elif any(word in authority_lower for word in ['client', 'customer']):
        return 8
    elif any(word in authority_lower for word in ['team', 'colleague', 'coworker']):
        return 5
    return 3

def calculate_stakes_score(stakes_str: str) -> int:
    """Calculate score based on consequence severity"""
    if not stakes_str or stakes_str == "TBD":
        return 3

    stakes_lower = stakes_str.lower()

    high_impact = ['lose', 'fail', 'miss', 'ineligible', 'penalty', 'fired', 'expelled', 'rejected']
    medium_impact = ['delay', 'postpone', 'late', 'behind', 'slow']

    if any(word in stakes_lower for word in high_impact):
        return 10
    elif any(word in stakes_lower for word in medium_impact):
        return 6
    return 3

def calculate_obligation_score(obligation: Dict) -> Dict:
    """Calculate total priority score"""
    deadline_score = calculate_deadline_score(obligation.get('deadline'))
    authority_score = calculate_authority_score(obligation.get('authority'))
    stakes_score = calculate_stakes_score(obligation.get('stakes'))
    blocking_score = 8 if obligation.get('blocking') else 0
    relevance_score = 5

    total_score = (
        deadline_score * 1.5 +
        authority_score * 1.2 +
        stakes_score * 1.3 +
        blocking_score * 1.0 +
        relevance_score * 0.5
    )

    return {
        'total_score': round(total_score, 2),
        'deadline_score': deadline_score,
        'authority_score': authority_score,
        'stakes_score': stakes_score,
        'blocking_score': blocking_score,
        'relevance_score': relevance_score
    }

def generate_micro_action(obligation: Dict) -> Dict:
    """Generate micro-action and motivation"""
    return {
        'micro_action': f"Start by: {obligation['action'][:50]}...",
        'motivation': "One small step can make this feel more manageable.",
        'action_type': 'task',
        'prepared_content': None,
        'requires_approval': False,
        'safety_flags': []
    }

# ==================== API ENDPOINTS ====================

@app.get("/oauth/gmail")
async def gmail_oauth_init(user_id: Optional[str] = None):
    """
    Initiate Gmail OAuth flow
    Redirects user to Google consent screen
    """
    try:
        state = None
        if user_id:
            state = _sign_oauth_state(
                {"user_id": user_id, "nonce": str(uuid.uuid4()), "ts": int(time.time())}
            )
        auth_url = get_gmail_auth_url(state=state)
        logger.info("Redirecting user to Gmail OAuth consent screen")
        return RedirectResponse(url=auth_url)

    except ValueError as e:
        logger.error(f"Gmail OAuth configuration error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Gmail OAuth not configured: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error initiating Gmail OAuth: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate OAuth: {str(e)}"
        )

@app.get("/oauth/gmail/callback")
async def gmail_oauth_callback(code: str = None, error: str = None, state: Optional[str] = None):
    """
    Handle Gmail OAuth callback
    Exchanges authorization code for tokens and stores credentials
    """
    # Handle OAuth errors
    if error:
        logger.error(f"Gmail OAuth error: {error}")
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}/emails?oauth_error={error}")

    if not code:
        logger.error("No authorization code received")
        raise HTTPException(
            status_code=400,
            detail="No authorization code received"
        )

    try:
        # Exchange code for tokens
        tokens = exchange_gmail_code_for_tokens(code)

        # If we have a signed state, store per-user connection in Supabase.
        if state:
            from backend.email_monitor import _get_supabase

            payload = _verify_oauth_state(state)
            user_id = payload.get("user_id")
            if not user_id:
                raise HTTPException(status_code=400, detail="Missing user_id in OAuth state")

            sb = _get_supabase()
            existing = sb.table("email_connections").select("*").eq("user_id", user_id).single().execute()
            existing_data = existing.data or {}

            sb.table("email_connections").upsert(
                {
                    "user_id": user_id,
                    "provider": "gmail",
                    "access_token": tokens["access_token"],
                    # Google may not return refresh_token on subsequent consents.
                    "refresh_token": tokens.get("refresh_token") or existing_data.get("refresh_token"),
                    "token_expiry": tokens.get("expires_at"),
                    "email_address": tokens.get("email") or existing_data.get("email_address"),
                    "is_active": True,
                },
                on_conflict="user_id",
            ).execute()
        else:
            # Legacy single-user local dev (writes token.json)
            save_gmail_credentials(
                user_id="default_user",
                email=tokens.get("email") or "gmail_user",
                access_token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token"),
                expires_at=tokens.get("expires_at"),
            )

        logger.info(f"Gmail OAuth successful for {tokens.get('email')}")

        # Redirect back to frontend with success
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}/emails?oauth_success=gmail")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Gmail OAuth callback: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"OAuth callback failed: {str(e)}"
        )

@app.get("/oauth/outlook")
async def outlook_oauth_init():
    """
    Initiate Outlook OAuth flow
    Redirects user to Microsoft consent screen
    """
    try:
        auth_url = get_outlook_auth_url()
        logger.info("Redirecting user to Outlook OAuth consent screen")
        return RedirectResponse(url=auth_url)

    except ValueError as e:
        logger.error(f"Outlook OAuth configuration error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Outlook OAuth not configured: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error initiating Outlook OAuth: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate OAuth: {str(e)}"
        )

@app.get("/oauth/outlook/callback")
async def outlook_oauth_callback(code: str = None, error: str = None):
    """
    Handle Outlook OAuth callback
    Exchanges authorization code for tokens and stores credentials
    """
    # Handle OAuth errors
    if error:
        logger.error(f"Outlook OAuth error: {error}")
        # Redirect to frontend with error
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}?oauth_error={error}")

    if not code:
        logger.error("No authorization code received")
        raise HTTPException(
            status_code=400,
            detail="No authorization code received"
        )

    try:
        # Exchange code for tokens
        tokens = exchange_outlook_code_for_tokens(code)

        # Save credentials (user_id is 'default_user' for now)
        save_outlook_credentials(
            user_id='default_user',
            email=tokens['email'],
            access_token=tokens['access_token'],
            refresh_token=tokens['refresh_token'],
            expires_at=tokens['expires_at']
        )

        logger.info(f"Outlook OAuth successful for {tokens['email']}")

        # Redirect back to frontend with success
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(url=f"{frontend_url}/connect?oauth_success=outlook")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in Outlook OAuth callback: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"OAuth callback failed: {str(e)}"
        )

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Obligo API",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/daily_digest/")
async def daily_digest(top_n: int = 5, provider: str = "all"):
    """
    Get daily digest of top obligations from Gmail and/or Outlook
    Handles edge cases and always returns valid JSON

    Args:
        top_n: Number of top obligations to return
        provider: 'gmail', 'outlook', or 'all' (default)
    """
    try:
        all_emails = []
        sources_used = []

        # Fetch Gmail emails if configured and requested
        gmail_configured = os.path.exists('credentials.json') and os.path.exists('token.json')
        if (provider in ['gmail', 'all']) and gmail_configured:
            try:
                gmail_emails = fetch_gmail_emails(max_results=50)
                # Add source identifier to each email
                for email in gmail_emails:
                    email['source'] = 'gmail'
                all_emails.extend(gmail_emails)
                sources_used.append('gmail')
                logger.info(f"Fetched {len(gmail_emails)} emails from Gmail")
            except Exception as e:
                logger.error(f"Error fetching Gmail emails: {str(e)}")

        # Fetch Outlook emails if configured and requested
        outlook_creds = load_outlook_credentials()
        if (provider in ['outlook', 'all']) and outlook_creds:
            try:
                outlook_messages = fetch_outlook_messages(
                    outlook_creds['access_token'],
                    max_results=50
                )
                # Normalize Outlook messages to match Gmail format
                outlook_emails = [normalize_outlook_message(msg) for msg in outlook_messages]
                all_emails.extend(outlook_emails)
                sources_used.append('outlook')
                logger.info(f"Fetched {len(outlook_messages)} emails from Outlook")
            except Exception as e:
                logger.error(f"Error fetching Outlook emails: {str(e)}")

        # If no emails fetched from any source, return demo data
        if len(all_emails) == 0:
            logger.warning("No email sources configured, returning demo data")
            return {
                "message": "No email sources configured. Showing demo data.",
                "sources": [],
                "total_obligations": len(get_demo_obligations()),
                "top_obligations": get_demo_obligations()[:top_n]
            }

        # Analyze all emails with Claude
        obligations = []
        api_failed = False  # Track if API is unavailable

        for email in all_emails:
            # Skip analysis if API already failed (no credits, etc.)
            if api_failed:
                continue

            try:
                analysis = analyze_email_with_claude(email['full_text'])

                if analysis.get('requires_action'):
                    # Add source information to obligation
                    analysis['email_source'] = email.get('source', 'unknown')
                    analysis['email_id'] = email.get('emailId', email.get('id', ''))
                    analysis['sender'] = email.get('sender', 'Unknown')
                    analysis['sourceLink'] = email.get('sourceLink', '')
                    obligations.append(analysis)

            except Exception as e:
                error_msg = str(e)
                logger.error(f"Error analyzing email: {error_msg}")
                # If API credits are low, skip all remaining emails
                if 'credit balance' in error_msg.lower() or '400' in error_msg:
                    logger.warning("API unavailable - skipping remaining emails, using demo data")
                    api_failed = True
                continue

        # Score and rank obligations
        scored_obligations = []
        for obl in obligations:
            scores = calculate_obligation_score(obl)
            obl.update(scores)
            scored_obligations.append(obl)

        scored_obligations.sort(key=lambda x: x['total_score'], reverse=True)
        top_obligations = scored_obligations[:top_n]

        # Add micro-actions, obligation IDs, type, and action paths
        for idx, obl in enumerate(top_obligations, 1):
            obl['obligation_id'] = f"obl_{datetime.now().strftime('%Y%m%d')}_{idx}"
            micro_action = generate_micro_action(obl)
            obl.update(micro_action)

            # Add obligation type and action path
            obl['type'] = classify_obligation_type(obl)
            obl['actionPath'] = get_action_path(obl['type'])

        logger.info(f"Returning {len(top_obligations)} obligations from {', '.join(sources_used)}")

        # If no obligations found, return demo data
        if len(top_obligations) == 0:
            logger.warning("No obligations found, returning demo data")
            return {
                "message": "Nothing stood out from your emails. Showing sample data.",
                "sources": sources_used,
                "total_obligations": len(get_demo_obligations()),
                "top_obligations": get_demo_obligations()[:top_n]
            }

        return {
            "sources": sources_used,
            "total_obligations": len(obligations),
            "top_obligations": top_obligations
        }

    except Exception as e:
        logger.error(f"Error in daily_digest: {str(e)}")
        # Always return demo data on error
        return {
            "message": f"Error occurred: {str(e)[:100]}. Showing demo data.",
            "sources": [],
            "total_obligations": len(get_demo_obligations()),
            "top_obligations": get_demo_obligations()[:top_n]
        }

@app.post("/approve_action/")
async def approve_action(request: MicroActionRequest):
    """
    Approve, review, or skip an obligation
    Logs action to action_log.json (Supabase-ready)
    """
    try:
        # Log the action
        log_action(
            obligation_id=request.obligation_id,
            action="user_action",
            approval_status=request.approval_status,
            score=0.0,  # Score would come from obligation data
            notes=request.user_notes
        )

        logger.info(f"Action approved: {request.obligation_id} - {request.approval_status}")

        return {
            "status": "success",
            "message": f"Obligation {request.approval_status}",
            "obligation_id": request.obligation_id,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error approving action: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to approve action",
                "message": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )

@app.get("/trigger_daily_check/")
async def trigger_daily_check():
    """Manually trigger daily obligation check"""
    try:
        logger.info("Manual daily check triggered")
        return {
            "status": "success",
            "message": "Daily check triggered",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error triggering daily check: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/action_log/")
async def get_action_log():
    """Get action log (for debugging/admin)"""
    try:
        log_file = Path("action_log.json")
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
            return {"logs": logs, "count": len(logs)}
        return {"logs": [], "count": 0}
    except Exception as e:
        logger.error(f"Error reading action log: {str(e)}")
        return {"logs": [], "count": 0, "error": str(e)}

# ==================== EXECUTION ENDPOINTS ====================

def generate_demo_action_plan(obligation_id: str, obligation_summary: str) -> ActionPlan:
    """Generate a demo action plan based on obligation type"""
    summary_lower = obligation_summary.lower()

    if any(word in summary_lower for word in ['proposal', 'document', 'report']):
        steps = [
            ActionStep(step_id=1, description="Open the document draft", estimated_minutes=2),
            ActionStep(step_id=2, description="Review and finalize content", estimated_minutes=15),
            ActionStep(step_id=3, description="Add pricing/details section", estimated_minutes=10),
            ActionStep(step_id=4, description="Proofread for errors", estimated_minutes=5),
            ActionStep(step_id=5, description="Send to recipient", url="https://mail.google.com", estimated_minutes=3),
        ]
    elif any(word in summary_lower for word in ['email', 'respond', 'reply', 'professor']):
        steps = [
            ActionStep(step_id=1, description="Open email thread", url="https://mail.google.com", estimated_minutes=1),
            ActionStep(step_id=2, description="Draft your response", estimated_minutes=5),
            ActionStep(step_id=3, description="Review tone and content", estimated_minutes=2),
            ActionStep(step_id=4, description="Send the email", estimated_minutes=1),
        ]
    elif any(word in summary_lower for word in ['review', 'pull request', 'code', 'github']):
        steps = [
            ActionStep(step_id=1, description="Open the pull request", url="https://github.com", estimated_minutes=1),
            ActionStep(step_id=2, description="Review code changes", estimated_minutes=10),
            ActionStep(step_id=3, description="Test locally if needed", estimated_minutes=5),
            ActionStep(step_id=4, description="Leave feedback or approve", estimated_minutes=3),
        ]
    else:
        steps = [
            ActionStep(step_id=1, description="Open the relevant document or page", estimated_minutes=2),
            ActionStep(step_id=2, description="Review the requirements", estimated_minutes=5),
            ActionStep(step_id=3, description="Complete the main task", estimated_minutes=15),
            ActionStep(step_id=4, description="Verify and submit", estimated_minutes=3),
        ]

    total_minutes = sum(s.estimated_minutes for s in steps)

    return ActionPlan(
        obligation_id=obligation_id,
        title=f"Action Plan: {obligation_summary[:50]}",
        steps=steps,
        total_estimated_minutes=total_minutes
    )

@app.get("/api/obligations/{obligation_id}/action_plan")
async def get_action_plan(obligation_id: str, summary: str = "Complete this task"):
    """
    Get or generate an action plan for an obligation
    """
    try:
        # Check if plan already exists
        if obligation_id in action_plans_db:
            plan = action_plans_db[obligation_id]
            # Add completion status from progress db
            progress = execution_progress_db.get(obligation_id, {})
            steps_with_progress = []
            for step in plan.steps:
                step_dict = step.dict()
                step_dict['completed'] = progress.get(step.step_id, False)
                steps_with_progress.append(step_dict)

            return {
                "obligation_id": plan.obligation_id,
                "title": plan.title,
                "steps": steps_with_progress,
                "total_estimated_minutes": plan.total_estimated_minutes
            }

        # Generate new plan (demo version - would use Claude API with credits)
        plan = generate_demo_action_plan(obligation_id, summary)
        action_plans_db[obligation_id] = plan
        execution_progress_db[obligation_id] = {}

        logger.info(f"Generated action plan for {obligation_id}")

        return {
            "obligation_id": plan.obligation_id,
            "title": plan.title,
            "steps": [s.dict() for s in plan.steps],
            "total_estimated_minutes": plan.total_estimated_minutes
        }

    except Exception as e:
        logger.error(f"Error generating action plan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/obligations/{obligation_id}/steps/{step_id}/complete")
async def complete_step(obligation_id: str, step_id: int):
    """Mark a step as completed"""
    try:
        if obligation_id not in execution_progress_db:
            execution_progress_db[obligation_id] = {}

        execution_progress_db[obligation_id][step_id] = True

        # Calculate progress
        plan = action_plans_db.get(obligation_id)
        if plan:
            total_steps = len(plan.steps)
            completed_steps = sum(1 for s in plan.steps if execution_progress_db[obligation_id].get(s.step_id, False))
            progress_percent = (completed_steps / total_steps) * 100 if total_steps > 0 else 0
        else:
            progress_percent = 0
            completed_steps = 0
            total_steps = 0

        logger.info(f"Step {step_id} completed for {obligation_id}")

        return {
            "status": "success",
            "step_id": step_id,
            "completed": True,
            "progress_percent": progress_percent,
            "completed_steps": completed_steps,
            "total_steps": total_steps
        }

    except Exception as e:
        logger.error(f"Error completing step: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/obligations/{obligation_id}/progress")
async def get_progress(obligation_id: str):
    """Get execution progress for an obligation"""
    try:
        progress = execution_progress_db.get(obligation_id, {})
        plan = action_plans_db.get(obligation_id)

        if not plan:
            return {"progress_percent": 0, "completed_steps": 0, "total_steps": 0}

        total_steps = len(plan.steps)
        completed_steps = sum(1 for s in plan.steps if progress.get(s.step_id, False))
        progress_percent = (completed_steps / total_steps) * 100 if total_steps > 0 else 0

        return {
            "progress_percent": progress_percent,
            "completed_steps": completed_steps,
            "total_steps": total_steps,
            "steps": {s.step_id: progress.get(s.step_id, False) for s in plan.steps}
        }

    except Exception as e:
        logger.error(f"Error getting progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ACTIVITY HISTORY ENDPOINTS ====================

@app.get("/api/activity/timeline")
async def get_activity_timeline(period: str = "7_days"):
    """Get activity timeline grouped by date"""
    try:
        log_file = Path("action_log.json")
        if not log_file.exists():
            return {"timeline": [], "total_count": 0}

        with open(log_file, 'r') as f:
            logs = json.load(f)

        # Calculate date range
        today = datetime.now()
        if period == "today":
            start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "7_days":
            start_date = today - timedelta(days=7)
        elif period == "30_days":
            start_date = today - timedelta(days=30)
        else:
            start_date = today - timedelta(days=7)

        # Filter and group by date
        filtered_logs = []
        for log in logs:
            try:
                log_date = datetime.fromisoformat(log['timestamp'])
                if log_date >= start_date:
                    filtered_logs.append({
                        **log,
                        'date': log_date.strftime('%Y-%m-%d'),
                        'time': log_date.strftime('%I:%M %p')
                    })
            except:
                continue

        # Group by date
        grouped = {}
        for log in filtered_logs:
            date_key = log['date']
            if date_key not in grouped:
                grouped[date_key] = []
            grouped[date_key].append(log)

        # Convert to list sorted by date descending
        timeline = [
            {"date": date, "activities": activities}
            for date, activities in sorted(grouped.items(), reverse=True)
        ]

        return {
            "timeline": timeline,
            "total_count": len(filtered_logs),
            "period": period
        }

    except Exception as e:
        logger.error(f"Error getting activity timeline: {str(e)}")
        return {"timeline": [], "total_count": 0, "error": str(e)}

@app.get("/api/activity/stats")
async def get_activity_stats(period: str = "7_days"):
    """Get activity statistics"""
    try:
        log_file = Path("action_log.json")
        if not log_file.exists():
            return {
                "obligations_completed": 0,
                "steps_completed": 0,
                "total_activities": 0,
                "most_productive_day": None,
                "streak_days": 0
            }

        with open(log_file, 'r') as f:
            logs = json.load(f)

        # Calculate date range
        today = datetime.now()
        if period == "today":
            start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "7_days":
            start_date = today - timedelta(days=7)
        elif period == "30_days":
            start_date = today - timedelta(days=30)
        else:
            start_date = today - timedelta(days=7)

        # Filter logs
        filtered_logs = []
        for log in logs:
            try:
                log_date = datetime.fromisoformat(log['timestamp'])
                if log_date >= start_date:
                    filtered_logs.append(log)
            except:
                continue

        # Calculate stats
        obligations_completed = sum(1 for log in filtered_logs if log.get('approval_status') == 'done')

        # Count by day for most productive
        day_counts = {}
        for log in filtered_logs:
            try:
                log_date = datetime.fromisoformat(log['timestamp']).strftime('%A')
                day_counts[log_date] = day_counts.get(log_date, 0) + 1
            except:
                continue

        most_productive_day = max(day_counts, key=day_counts.get) if day_counts else None

        # Calculate streak (consecutive days with activity)
        activity_dates = set()
        for log in logs:
            try:
                log_date = datetime.fromisoformat(log['timestamp']).date()
                activity_dates.add(log_date)
            except:
                continue

        streak = 0
        check_date = today.date()
        while check_date in activity_dates:
            streak += 1
            check_date -= timedelta(days=1)

        return {
            "obligations_completed": obligations_completed,
            "steps_completed": len([l for l in filtered_logs if 'step' in str(l.get('action', '')).lower()]),
            "total_activities": len(filtered_logs),
            "most_productive_day": most_productive_day,
            "streak_days": streak,
            "period": period
        }

    except Exception as e:
        logger.error(f"Error getting activity stats: {str(e)}")
        return {
            "obligations_completed": 0,
            "steps_completed": 0,
            "total_activities": 0,
            "most_productive_day": None,
            "streak_days": 0,
            "error": str(e)
        }

@app.delete("/api/activity/clear")
async def clear_old_activities(days: int = 30):
    """Clear activities older than specified days"""
    try:
        log_file = Path("action_log.json")
        if not log_file.exists():
            return {"deleted_count": 0}

        with open(log_file, 'r') as f:
            logs = json.load(f)

        cutoff_date = datetime.now() - timedelta(days=days)

        new_logs = []
        deleted_count = 0
        for log in logs:
            try:
                log_date = datetime.fromisoformat(log['timestamp'])
                if log_date >= cutoff_date:
                    new_logs.append(log)
                else:
                    deleted_count += 1
            except:
                new_logs.append(log)

        with open(log_file, 'w') as f:
            json.dump(new_logs, f, indent=2)

        logger.info(f"Cleared {deleted_count} old activities")
        return {"deleted_count": deleted_count, "remaining": len(new_logs)}

    except Exception as e:
        logger.error(f"Error clearing activities: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== MANUAL OBLIGATION ENDPOINTS ====================
# ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
# These endpoints originally created an in-memory "manual obligations" system.
# That is NOT canonical. Keep the endpoints for compatibility, but route creation
# into Supabase `obligations` and treat the in-memory store as a temporary cache only.

class ManualObligation(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: str
    priority: str = "medium"
    category: Optional[str] = None
    source: str = "manual"

class NLPCreateRequest(BaseModel):
    text: str

# In-memory store for manual obligations
manual_obligations_db: Dict[str, Dict] = {}

@app.post("/api/obligations/create")
async def create_manual_obligation(obligation: ManualObligation):
    """Let users manually create obligations"""
    try:
        if obligation.priority not in ["high", "medium", "low"]:
            raise HTTPException(status_code=400, detail="Priority must be high, medium, or low")

        obligation_id = f"obl_{int(datetime.now().timestamp())}_{len(manual_obligations_db)}"

        new_obligation = {
            "obligation_id": obligation_id,
            "summary": obligation.title,
            "action": obligation.description or obligation.title,
            "deadline": obligation.deadline,
            "priority": obligation.priority,
            "category": obligation.category,
            "source": obligation.source,
            "status": "pending",
            "sender": "You",
            "total_score": 45 if obligation.priority == "high" else (30 if obligation.priority == "medium" else 15),
            "created_at": datetime.now().isoformat()
        }

        manual_obligations_db[obligation_id] = new_obligation

        # Log activity
        log_file = Path("action_log.json")
        logs = []
        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)

        logs.append({
            "timestamp": datetime.now().isoformat(),
            "user_id": "default_user",
            "obligation_id": obligation_id,
            "action": f"Created: {obligation.title}",
            "approval_status": "pending",
            "source": obligation.source
        })

        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)

        logger.info(f"Manual obligation created: {obligation.title}")

        return {
            "success": True,
            "obligation": new_obligation,
            "message": "Obligation created successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating obligation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/obligations/create-from-text")
async def create_obligation_from_text(req: NLPCreateRequest):
    """Parse natural language and create obligation (demo mode)"""
    try:
        text = req.text.lower()

        # Demo NLP parsing - extract key details from text
        title = req.text.strip()
        if len(title) > 60:
            title = title[:57] + "..."

        # Detect priority
        priority = "medium"
        if any(w in text for w in ["urgent", "asap", "critical", "high priority", "immediately"]):
            priority = "high"
        elif any(w in text for w in ["low", "whenever", "no rush", "eventually"]):
            priority = "low"

        # Detect deadline
        deadline = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        if "tomorrow" in text:
            deadline = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        elif "today" in text:
            deadline = datetime.now().strftime("%Y-%m-%d")
        elif "next week" in text:
            deadline = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        elif "next friday" in text:
            days_ahead = 4 - datetime.now().weekday()
            if days_ahead <= 0:
                days_ahead += 7
            deadline = (datetime.now() + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        elif "end of month" in text or "by end of month" in text:
            import calendar
            last_day = calendar.monthrange(datetime.now().year, datetime.now().month)[1]
            deadline = datetime.now().replace(day=last_day).strftime("%Y-%m-%d")
        else:
            # Try to find dates like "march 1", "feb 15", etc.
            import re as re_mod
            months = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                      "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
                      "january": 1, "february": 2, "march": 3, "april": 4,
                      "june": 6, "july": 7, "august": 8, "september": 9,
                      "october": 10, "november": 11, "december": 12}
            for month_name, month_num in months.items():
                pattern = rf'{month_name}\s+(\d{{1,2}})'
                match = re_mod.search(pattern, text)
                if match:
                    day = int(match.group(1))
                    year = datetime.now().year
                    try:
                        parsed_date = datetime(year, month_num, day)
                        if parsed_date < datetime.now():
                            parsed_date = datetime(year + 1, month_num, day)
                        deadline = parsed_date.strftime("%Y-%m-%d")
                    except ValueError:
                        pass
                    break

        # Detect category
        category = "general"
        if any(w in text for w in ["tuition", "fee", "payment", "deposit", "financial"]):
            category = "financial"
        elif any(w in text for w in ["housing", "apartment", "dorm", "rent"]):
            category = "housing"
        elif any(w in text for w in ["application", "apply", "submit", "transcript"]):
            category = "application"
        elif any(w in text for w in ["register", "enrollment", "class", "course"]):
            category = "registration"

        # Clean up title - remove filler words
        clean_title = req.text.strip()
        for prefix in ["remind me to ", "i need to ", "add ", "don't forget to ", "remember to "]:
            if clean_title.lower().startswith(prefix):
                clean_title = clean_title[len(prefix):]
                break
        clean_title = clean_title[0].upper() + clean_title[1:] if clean_title else req.text

        # Create the obligation
        obligation = ManualObligation(
            title=clean_title,
            description=req.text,
            deadline=deadline,
            priority=priority,
            category=category,
            source="manual_nlp"
        )

        result = await create_manual_obligation(obligation)

        return {
            **result,
            "parsed_from": req.text,
            "extracted": {
                "title": clean_title,
                "deadline": deadline,
                "priority": priority,
                "category": category
            }
        }

    except Exception as e:
        logger.error(f"Error parsing text obligation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/obligations/{obligation_id}")
async def update_obligation(obligation_id: str, updates: dict):
    """Update an existing obligation"""
    try:
        allowed_fields = ["title", "description", "deadline", "priority", "category", "status"]
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        if obligation_id in manual_obligations_db:
            for key, value in filtered_updates.items():
                if key == "title":
                    manual_obligations_db[obligation_id]["summary"] = value
                manual_obligations_db[obligation_id][key] = value

            logger.info(f"Obligation updated: {obligation_id}")

        return {
            "success": True,
            "obligation_id": obligation_id,
            "updated_fields": filtered_updates
        }

    except Exception as e:
        logger.error(f"Error updating obligation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/obligations/manual")
async def get_manual_obligations():
    """Get all manually created obligations"""
    try:
        return {
            "obligations": list(manual_obligations_db.values()),
            "count": len(manual_obligations_db)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== AI CHAT ENDPOINTS ====================

class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    suggestions: Optional[List[str]] = None

# In-memory chat history (would use Supabase in production)
chat_history_db: Dict[str, List[Dict]] = {}

def get_demo_chat_response(message: str, obligations: List[Dict] = None) -> ChatResponse:
    """Generate demo chat responses based on keywords"""
    message_lower = message.lower()

    # Detect creation intent
    creation_keywords = ["remind me", "add", "i need to", "don't forget", "remember to", "create"]
    if any(keyword in message_lower for keyword in creation_keywords):
        return ChatResponse(
            response=f"I can track that for you. Click the '+ Add' button in the top bar, or use the Natural Language mode to say:\n\n\"{message}\"\n\nI'll extract the title, date, and relevance automatically.",
            suggestions=["Add item", "What stands out today?", "Help me think through priorities"]
        )

    # Check for obligation-related questions
    if any(word in message_lower for word in ['what', 'obligation', 'task', 'do i have', 'pending', 'stands out']):
        if obligations:
            task_list = "\n".join([f"• {o.get('summary', 'Item')}" for o in obligations[:3]])
            return ChatResponse(
                response=f"Here are {len(obligations)} items that stand out:\n\n{task_list}\n\nWould you like to think through which ones matter most right now?",
                suggestions=["Think through priorities", "Show upcoming dates", "Help me start"]
            )
        return ChatResponse(
            response="Nothing stands out right now. Your inbox looks clear.",
            suggestions=["Check inbox again", "Show completed items", "Add something to track"]
        )

    # Priority questions
    if any(word in message_lower for word in ['priority', 'urgent', 'important', 'first', 'priorities']):
        return ChatResponse(
            response="Looking at what you have, the items with the closest dates tend to matter most. I can sort by date or by relevance — your call.",
            suggestions=["Sort by date", "Sort by relevance", "Show what matters most"]
        )

    # Help with specific task
    if any(word in message_lower for word in ['help', 'how', 'start', 'begin']):
        return ChatResponse(
            response="I can break any item into smaller steps if that helps. Click 'What are my options?' on any item to see a step-by-step guide.",
            suggestions=["Show steps", "Quick tips", "Think through timing"]
        )

    # Time management
    if any(word in message_lower for word in ['time', 'schedule', 'when', 'busy']):
        return ChatResponse(
            response="Based on what you have, it looks like about 45 minutes of focused time could address most items. Want me to help think through a plan?",
            suggestions=["Suggest a plan", "Block time", "Set aside for later"]
        )

    # Greeting
    if any(word in message_lower for word in ['hi', 'hello', 'hey', 'morning', 'afternoon']):
        return ChatResponse(
            response="Hello! I can help you think through what matters most today, surface relevant context, or break something down into steps. What's on your mind?",
            suggestions=["What stands out today?", "Help me think through priorities", "Show upcoming dates"]
        )

    # Default response
    return ChatResponse(
        response="I can help you think through what matters, surface context from your inbox, or break items into steps. What would be most helpful?",
        suggestions=["What stands out today?", "Help me think through priorities", "Show upcoming dates"]
    )

@app.post("/api/chat/message")
async def send_chat_message(chat: ChatMessage):
    """Send a message to the AI assistant"""
    try:
        # Get current obligations for context
        obligations = []
        try:
            # Try to get real obligations, fall back to demo
            log_file = Path("action_log.json")
            if log_file.exists():
                with open(log_file, 'r') as f:
                    logs = json.load(f)
                    # Filter for pending/incomplete
                    obligations = [l for l in logs if l.get('approval_status') != 'done'][-5:]
        except:
            pass

        # Generate response (demo mode since API credits are low)
        response = get_demo_chat_response(chat.message, obligations)

        logger.info(f"Chat message processed: {chat.message[:50]}...")

        return {
            "response": response.response,
            "suggestions": response.suggestions,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error processing chat message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/quick_question")
async def quick_question(question: str = "What should I focus on?"):
    """Get a quick answer about obligations"""
    try:
        # Demo quick answers based on question type
        question_lower = question.lower()

        if "focus" in question_lower or "priority" in question_lower:
            answer = "Items with the closest dates tend to stand out most. You can review them on your dashboard and decide what feels right to focus on."
        elif "deadline" in question_lower:
            answer = "Your nearest date is shown on each item card. Amber indicators highlight items coming up soon."
        elif "complete" in question_lower or "done" in question_lower:
            answer = "Mark items as done using the checkmark button, or click 'What are my options?' for step-by-step guidance."
        else:
            answer = "I can help you think through what matters most. Ask about priorities, upcoming dates, or how to approach specific items."

        return {
            "question": question,
            "answer": answer,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error with quick question: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice/morning-briefing")
async def get_morning_briefing():
    """Get a text briefing suitable for text-to-speech"""
    try:
        # Get today's obligations count
        log_file = Path("action_log.json")
        pending_count = 0
        completed_today = 0

        if log_file.exists():
            with open(log_file, 'r') as f:
                logs = json.load(f)
                today = datetime.now().date()
                for log in logs:
                    try:
                        log_date = datetime.fromisoformat(log['timestamp']).date()
                        if log_date == today and log.get('approval_status') == 'done':
                            completed_today += 1
                    except:
                        continue

        # Generate briefing text
        hour = datetime.now().hour
        if hour < 12:
            greeting = "Good morning"
        elif hour < 17:
            greeting = "Good afternoon"
        else:
            greeting = "Good evening"

        briefing = f"{greeting}. Here's what stands out today. "

        if completed_today > 0:
            briefing += f"You've addressed {completed_today} item{'s' if completed_today != 1 else ''} today. "

        briefing += "You can check your inbox for anything new, or review what's on your dashboard. "
        briefing += "If anything feels unclear, you can break it into steps. "
        briefing += "Take it at your own pace."

        return {
            "briefing": briefing,
            "greeting": greeting,
            "completed_today": completed_today,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error generating morning briefing: {str(e)}")
        return {
            "briefing": "Good day. Here is what stands out today. Check your dashboard to see what's there.",
            "greeting": "Hello",
            "completed_today": 0,
            "error": str(e)
        }

# ==================== TRADEOFFS ENGINE ====================

TRADEOFFS_DB = {
    "fafsa": {
        "title": "FAFSA Application",
        "tradeoffs": [
            {"text": "Federal grants average $6,895/year — requires FAFSA on file", "level": "notable"},
            {"text": "Federal student loans are only available through FAFSA", "level": "notable"},
            {"text": "State aid deadlines are often tied to FAFSA completion", "level": "moderate"},
            {"text": "Many scholarships require FAFSA as a prerequisite", "level": "moderate"},
        ],
        "totalCost": "$27,580+",
        "costPeriod": "over 4 years",
    },
    "housing": {
        "title": "Housing Deposit",
        "tradeoffs": [
            {"text": "Deposit ($300-$500) is typically non-refundable", "level": "notable"},
            {"text": "On-campus housing is usually reserved through this deposit", "level": "notable"},
            {"text": "Off-campus rent is typically $800-2000+/month more", "level": "moderate"},
            {"text": "Finding housing later may involve fewer options", "level": "minor"},
        ],
        "totalCost": "$18,000+",
        "costPeriod": "per year",
    },
    "college_app": {
        "title": "College Application",
        "tradeoffs": [
            {"text": "Most applications cannot be submitted after the deadline", "level": "notable"},
            {"text": "Application fee ($50-90) is not recoverable if incomplete", "level": "minor"},
            {"text": "Later options tend to be limited to open-admission schools", "level": "moderate"},
            {"text": "A gap year delays career start — average starting salary is ~$45K", "level": "moderate"},
        ],
        "totalCost": "$45,000+",
        "costPeriod": "in delayed earnings",
    },
    "scholarship": {
        "title": "Scholarship Application",
        "tradeoffs": [
            {"text": "Awards range from $1,000 to $50,000+ depending on the program", "level": "notable"},
            {"text": "Without scholarships, more may need to come from loans", "level": "moderate"},
            {"text": "Most scholarship windows are one-time — reapplication is rare", "level": "minor"},
        ],
        "totalCost": "$5,000+",
        "costPeriod": "average missed award",
    },
    "registration": {
        "title": "Course Registration",
        "tradeoffs": [
            {"text": "Popular courses fill up — this can delay graduation timelines", "level": "notable"},
            {"text": "Later registration often means less ideal schedules", "level": "minor"},
            {"text": "An extra semester typically costs $15,000+", "level": "moderate"},
        ],
        "totalCost": "$15,000+",
        "costPeriod": "per extra semester",
    },
}

class ConsequenceRequest(BaseModel):
    title: str
    deadline: Optional[str] = None
    category: Optional[str] = "general"

@app.post("/api/consequences/analyze")
async def analyze_consequences(req: ConsequenceRequest):
    """Analyze tradeoffs of not completing an item"""
    try:
        title_lower = req.title.lower()

        # Match to tradeoff data
        for key, data in TRADEOFFS_DB.items():
            if key in title_lower or any(word in title_lower for word in key.split("_")):
                return {"consequences": data["tradeoffs"], "totalCost": data["totalCost"], "costPeriod": data["costPeriod"], "title": data["title"], "source": "database"}

        # Generic tradeoffs for unrecognized items
        return {
            "consequences": [
                {"text": f"If '{req.title}' doesn't happen, it may affect your academic standing", "level": "moderate"},
                {"text": "Late submissions sometimes incur penalties or are not accepted", "level": "minor"},
                {"text": "This may affect other items that depend on it", "level": "minor"},
            ],
            "totalCost": "Varies",
            "costPeriod": "depending on the item",
            "title": req.title,
            "source": "ai_generated"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SCHOLARSHIP MATCHING ====================

SCHOLARSHIP_DB = [
    {"name": "Gates Millennium Scholars", "amount": 25000, "deadline": "2026-02-15", "match_criteria": ["gpa_3.3", "pell_eligible", "us_citizen"], "category": "need-based"},
    {"name": "National Merit Scholarship", "amount": 2500, "deadline": "2026-03-01", "match_criteria": ["psat_1400", "top_1_percent"], "category": "merit-based"},
    {"name": "Texas Grant Program", "amount": 10000, "deadline": "2026-03-15", "match_criteria": ["texas_resident", "financial_need", "fafsa_completed"], "category": "state-grant"},
    {"name": "Dell Scholars Program", "amount": 20000, "deadline": "2026-02-01", "match_criteria": ["gpa_2.4", "pell_eligible"], "category": "need-based"},
    {"name": "Hispanic Scholarship Fund", "amount": 5000, "deadline": "2026-04-01", "match_criteria": ["hispanic", "gpa_3.0", "us_citizen"], "category": "identity-based"},
]

@app.get("/api/scholarships/matches")
async def get_scholarship_matches():
    """Get AI-matched scholarships"""
    try:
        now = datetime.now()
        results = []
        for s in SCHOLARSHIP_DB:
            deadline = datetime.fromisoformat(s["deadline"])
            days_left = (deadline - now).days
            status = "expired" if days_left < 0 else "urgent" if days_left <= 7 else "eligible"
            results.append({
                **s,
                "days_left": max(days_left, 0),
                "status": status,
                "match_score": 85,  # Simplified
                "amount_formatted": f"${s['amount']:,}",
            })
        return {"scholarships": results, "total_potential": sum(s["amount"] for s in SCHOLARSHIP_DB)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SMART NOTIFICATIONS ====================

@app.get("/api/notifications/smart")
async def get_smart_notifications():
    """Get smart, actionable notifications"""
    try:
        notifications = []
        now = datetime.now()

        # Check for items with upcoming dates
        for ob in manual_obligations_db.values():
            if ob.get("status") == "completed":
                continue
            deadline = ob.get("deadline")
            if deadline:
                try:
                    dl = datetime.fromisoformat(deadline.replace("Z", ""))
                    days_left = (dl - now).days
                    if days_left <= 1:
                        notifications.append({
                            "type": "timely",
                            "title": f"{ob.get('summary', ob.get('title', 'Item'))} — {'tomorrow' if days_left == 1 else 'today'}",
                            "body": "This date is coming up. It may be worth looking at when you have a moment.",
                            "action": "View",
                            "obligation_id": ob.get("obligation_id"),
                        })
                    elif days_left <= 3:
                        notifications.append({
                            "type": "insight",
                            "title": f"{ob.get('summary', ob.get('title', 'Item'))} — in {days_left} days",
                            "body": "This is coming up soon. I can help break it into steps if that would help.",
                            "action": "See Steps",
                            "obligation_id": ob.get("obligation_id"),
                        })
                except:
                    pass

        return {"notifications": notifications, "unread_count": len(notifications)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PANIC MODE ====================

class PanicRequest(BaseModel):
    title: str
    category: Optional[str] = "general"

@app.post("/api/panic/generate-steps")
async def generate_panic_steps(req: PanicRequest):
    """Generate step-by-step breakdown to help focus on an item"""
    try:
        title_lower = req.title.lower()

        if "fafsa" in title_lower:
            steps = [
                {"task": "Gather tax documents (W-2s, 1099s, tax returns)", "duration": "30 min"},
                {"task": "Create or retrieve FSA ID at studentaid.gov", "duration": "15 min"},
                {"task": "Start FAFSA form — enter personal info", "duration": "20 min"},
                {"task": "Enter financial information from tax docs", "duration": "25 min"},
                {"task": "Select schools and review", "duration": "10 min"},
                {"task": "Sign and submit — screenshot confirmation", "duration": "5 min"},
            ]
        elif "housing" in title_lower or "deposit" in title_lower:
            steps = [
                {"task": "Log in to student housing portal", "duration": "5 min"},
                {"task": "Review room selection and meal plan", "duration": "10 min"},
                {"task": "Get credit/debit card ready", "duration": "2 min"},
                {"task": "Complete payment form", "duration": "10 min"},
                {"task": "Screenshot confirmation and save receipt", "duration": "3 min"},
            ]
        else:
            steps = [
                {"task": "Gather all required materials and information", "duration": "15 min"},
                {"task": "Open the relevant form or portal", "duration": "5 min"},
                {"task": "Complete primary sections", "duration": "30 min"},
                {"task": "Review all entries for accuracy", "duration": "10 min"},
                {"task": "Submit and save confirmation", "duration": "5 min"},
            ]

        return {"steps": steps, "total_steps": len(steps), "title": req.title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== BUDDY SYSTEM ====================

buddy_db: Dict[str, List[Dict]] = {}

class BuddyInvite(BaseModel):
    user_email: str
    buddy_email: str
    obligation_id: Optional[str] = None

@app.post("/api/buddies/invite")
async def invite_buddy(invite: BuddyInvite):
    """Invite an accountability buddy"""
    try:
        if invite.user_email not in buddy_db:
            buddy_db[invite.user_email] = []

        buddy = {
            "email": invite.buddy_email,
            "status": "pending",
            "invited_at": datetime.now().isoformat(),
            "obligation_id": invite.obligation_id,
            "tasks_helped": 0,
        }
        buddy_db[invite.user_email].append(buddy)

        return {"success": True, "message": f"Invitation sent to {invite.buddy_email}", "buddy": buddy}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/buddies/{user_email}")
async def get_buddies(user_email: str):
    """Get all buddies for a user"""
    return {"buddies": buddy_db.get(user_email, []), "count": len(buddy_db.get(user_email, []))}


# ==================== AUTOFILL VAULT ====================

vault_db: Dict[str, Dict] = {}

class VaultUpdate(BaseModel):
    category: str
    field_key: str
    value: str

@app.post("/api/vault/update")
async def update_vault_field(update: VaultUpdate):
    """Update a field in the auto-fill vault"""
    try:
        if update.category not in vault_db:
            vault_db[update.category] = {}
        vault_db[update.category][update.field_key] = {
            "value": update.value,
            "updated_at": datetime.now().isoformat(),
        }
        return {"success": True, "category": update.category, "field": update.field_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vault/data")
async def get_vault_data():
    """Get all vault data"""
    return {"vault": vault_db, "field_count": sum(len(v) for v in vault_db.values())}


# ==================== DAILY COACH LOOP ====================

class CheckInRequest(BaseModel):
    user_id: str
    free_text: str

class DailyEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    free_text: str
    date: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

class CoachBrief(BaseModel):
    """Internal brief - user never sees this. Stored as structured markdown."""
    entry_id: str
    generated_summary: str = ""

class CoachResponseModel(BaseModel):
    entry_id: str
    what_stands_out: str
    why_it_matters: str
    todays_anchor: str
    date: str

class EveningSignalRequest(BaseModel):
    entry_id: str
    response: str

class EveningSignal(BaseModel):
    entry_id: str
    response: str
    date: str

# In-memory storage for Daily Coach Loop
daily_entries_db: Dict[str, DailyEntry] = {}
coach_briefs_db: Dict[str, CoachBrief] = {}
coach_responses_db: Dict[str, CoachResponseModel] = {}
evening_signals_db: Dict[str, EveningSignal] = {}


def generate_coach_brief_and_response(entry: DailyEntry) -> CoachResponseModel:
    """Two-step AI: generate internal brief, then structured coach response."""
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")
    client = Anthropic(api_key=api_key)

    # Step 1: Internal brief (structured, user never sees this)
    brief_prompt = f"""# Task: Generate Coach Brief

Below is a user's daily check-in. Analyze it and produce a structured Coach Brief
for a human coach.

## User Check-In
{entry.free_text}

---

## Output Format (Strict)

### A. Domains Detected
List the primary domains involved.
Examples: Legal, School, Work, Money, Ideas, Personal Admin, Health.
Use short bullet points.

### B. Time Sensitivity
Classify items as:
- Urgent (today)
- Time-sensitive (this week)
- Open-ended

Explain briefly why.

### C. Avoidance or Drift Signals
Note any signs of:
- Repeated unresolved items
- Vague phrasing
- Emotional hedging
- Cognitive overload

Be neutral and specific.
If none detected, state "None detected."

### D. Leverage Assessment
Identify:
- Low-effort / high-relief items
- High-effort / high-impact items
- Likely noise

Do not recommend action.
Just label.

### E. Coach Summary (5-7 lines max)
Write a compressed summary a coach can read in under 30 seconds.
Highlight:
- What stands out most
- Why it matters
- What reducing uncertainty would help most today

Do NOT:
- Address the user directly
- Give advice
- Suggest a priority

This brief exists to support human judgment, not replace it."""

    brief_message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[{"role": "user", "content": brief_prompt}]
    )

    brief_text = brief_message.content[0].text.strip()
    brief = CoachBrief(entry_id=entry.id, generated_summary=brief_text)
    coach_briefs_db[entry.id] = brief

    # Step 2: Coach response (user-facing, structured)
    response_prompt = f"""# Task: Draft Coach Response (For Human Review)

Using the Coach Brief below, draft a single coach message.

The tone must be:
- Calm
- Direct
- Non-motivational
- Non-therapeutic

## Coach Brief
{brief_text}

---

## Response Structure (Required)

Return ONLY valid JSON with exactly three fields:
{{
  "what_stands_out": "One sentence naming the focal issue.",
  "why_it_matters": "One or two sentences explaining consequence or leverage.",
  "todays_anchor": "One clear attention anchor for today."
}}

Rules:
- No emojis
- No encouragement
- No multiple tasks
- No questions
- No soft language

This draft will be reviewed by a human coach before being sent."""

    response_message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": response_prompt}]
    )

    response_text = response_message.content[0].text.strip()
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    response_data = json.loads(response_text)
    coach_response = CoachResponseModel(
        entry_id=entry.id,
        date=entry.date,
        **response_data
    )
    coach_responses_db[entry.id] = coach_response
    return coach_response


@app.post("/api/coach/check-in")
async def submit_check_in(request: CheckInRequest):
    """Submit morning check-in. Triggers brief generation and coach response."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")

        existing = [e for e in daily_entries_db.values()
                    if e.user_id == request.user_id and e.date == today]
        if existing:
            entry = existing[0]
            if entry.id in coach_responses_db:
                return {
                    "entry_id": entry.id,
                    "status": "already_submitted",
                    "response": coach_responses_db[entry.id].dict()
                }
            return {"entry_id": entry.id, "status": "processing"}

        entry = DailyEntry(
            user_id=request.user_id,
            free_text=request.free_text,
            date=today
        )
        daily_entries_db[entry.id] = entry

        try:
            coach_response = generate_coach_brief_and_response(entry)
            return {
                "entry_id": entry.id,
                "status": "complete",
                "response": coach_response.dict()
            }
        except Exception as e:
            logger.error(f"Error generating coach response: {e}")
            fallback = CoachResponseModel(
                entry_id=entry.id,
                what_stands_out="I wasn't able to process your check-in fully. Try again in a moment.",
                why_it_matters="Technical difficulties happen. Your check-in is saved.",
                todays_anchor="Start with whatever feels most time-sensitive from what you wrote.",
                date=today
            )
            coach_responses_db[entry.id] = fallback
            return {
                "entry_id": entry.id,
                "status": "complete",
                "response": fallback.dict()
            }
    except Exception as e:
        logger.error(f"Check-in error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/coach/today")
async def get_today_status(user_id: str):
    """Get the full state for today: entry, response, evening signal."""
    today = datetime.now().strftime("%Y-%m-%d")

    entries = [e for e in daily_entries_db.values()
               if e.user_id == user_id and e.date == today]

    if not entries:
        return {"status": "no_entry", "entry": None, "response": None, "evening_signal": None}

    entry = entries[0]
    response = coach_responses_db.get(entry.id)
    evening = evening_signals_db.get(entry.id)

    return {
        "status": "complete" if response else "processing",
        "entry": entry.dict(),
        "response": response.dict() if response else None,
        "evening_signal": evening.dict() if evening else None
    }


@app.post("/api/coach/evening-signal")
async def submit_evening_signal(request: EveningSignalRequest):
    """Submit the evening reflection signal."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")

        if request.entry_id not in daily_entries_db:
            raise HTTPException(status_code=404, detail="Entry not found")

        signal = EveningSignal(
            entry_id=request.entry_id,
            response=request.response,
            date=today
        )
        evening_signals_db[request.entry_id] = signal
        logger.info(f"Evening signal recorded: {request.response} for entry {request.entry_id}")
        return {"status": "recorded", "signal": signal.dict()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Evening signal error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== EMAIL MONITORING ENDPOINTS ====================

class EmailScanRequest(BaseModel):
    user_id: str

class EmailConnectionRequest(BaseModel):
    user_id: str
    access_token: str
    refresh_token: Optional[str] = None
    email_address: Optional[str] = None

class EmailDismissRequest(BaseModel):
    user_id: str
    email_id: str


@app.post("/api/email/connect")
async def connect_email(request: EmailConnectionRequest):
    """Store a user's Gmail OAuth tokens in Supabase for monitoring."""
    try:
        from backend.email_monitor import EmailMonitor
        monitor = EmailMonitor()

        # Upsert connection
        monitor.supabase.table("email_connections").upsert({
            "user_id": request.user_id,
            "provider": "gmail",
            "access_token": request.access_token,
            "refresh_token": request.refresh_token,
            "email_address": request.email_address,
            "is_active": True,
        }, on_conflict="user_id").execute()

        return {"status": "connected", "provider": "gmail"}
    except Exception as e:
        logger.error(f"Email connect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/email/scan")
async def scan_emails(request: EmailScanRequest):
    """Trigger a manual email scan for a user. Fetches Gmail, analyzes with AI, stores in Supabase."""
    try:
        from backend.email_monitor import EmailMonitor
        monitor = EmailMonitor()

        # Get user's email connection
        connection = monitor.get_user_connection(request.user_id)
        if not connection:
            raise HTTPException(status_code=404, detail="No email connection found. Connect Gmail first.")

        # Get user's school names for context
        schools_result = monitor.supabase.table("schools") \
            .select("name") \
            .eq("user_id", request.user_id) \
            .execute()
        school_names = [s["name"] for s in (schools_result.data or [])]

        # Run the scan
        results = monitor.scan_user_emails(
            user_id=request.user_id,
            access_token=connection["access_token"],
            refresh_token=connection.get("refresh_token"),
            school_names=school_names,
        )

        return {"status": "complete", **results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email scan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/email/history")
async def get_email_history(user_id: str, limit: int = 50, actionable_only: bool = False):
    """Get analyzed email history for a user from Supabase."""
    try:
        from backend.email_monitor import EmailMonitor
        monitor = EmailMonitor()

        query = monitor.supabase.table("analyzed_emails") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("is_dismissed", False) \
            .order("created_at", desc=True) \
            .limit(limit)

        if actionable_only:
            query = query.eq("requires_action", True)

        result = query.execute()
        return {"emails": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Email history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/email/dismiss")
async def dismiss_email(request: EmailDismissRequest):
    """Dismiss an analyzed email so it no longer appears in the feed."""
    try:
        from backend.email_monitor import EmailMonitor
        monitor = EmailMonitor()

        monitor.supabase.table("analyzed_emails") \
            .update({"is_dismissed": True}) \
            .eq("id", request.email_id) \
            .eq("user_id", request.user_id) \
            .execute()

        return {"status": "dismissed"}
    except Exception as e:
        logger.error(f"Email dismiss error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/email/connection")
async def get_email_connection(user_id: str):
    """Check if a user has an active email connection."""
    try:
        from backend.email_monitor import EmailMonitor
        monitor = EmailMonitor()
        connection = monitor.get_user_connection(user_id)
        if connection:
            return {
                "connected": True,
                "provider": connection["provider"],
                "email": connection.get("email_address"),
                "last_scan": connection.get("last_scan_at"),
            }
        return {"connected": False}
    except Exception as e:
        logger.error(f"Email connection check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== OBLIGATIONS (CANONICAL) ENDPOINTS ====================

@app.get("/api/obligations")
async def list_obligations(user_id: str, status: Optional[str] = None, limit: int = 100):
    """
    List canonical obligations for a user (Supabase-backed).

    Phase 1 spine: obligations are the single source of truth for "things due".
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        query = sb.table("obligations") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("deadline", desc=False) \
            .limit(limit)

        if status:
            query = query.eq("status", status)

        result = query.execute()
        obligations = result.data or []
        if not obligations:
            return {"obligations": [], "count": 0}

        # Ensure dependency edges exist (deterministic rules only)
        by_school: dict[str, list[dict]] = {}
        for obl in obligations:
            ctx = _extract_school_context(obl.get("source_ref", ""))
            key = ctx or "__no_school__"
            by_school.setdefault(key, []).append(obl)

        by_school_type: dict[str, dict[str, list[dict]]] = {}
        for school_key, obls in by_school.items():
            by_school_type[school_key] = {}
            for obl in obls:
                by_school_type[school_key].setdefault(obl["type"], []).append(obl)

        obl_ids = [o["id"] for o in obligations]
        existing_deps_res = sb.table("obligation_dependencies") \
            .select("*") \
            .in_("obligation_id", obl_ids) \
            .execute()
        existing_deps = existing_deps_res.data or []
        existing_edges = {(d["obligation_id"], d["depends_on_obligation_id"]) for d in existing_deps}

        edges_to_create = []
        for obl in obligations:
            required_types = _required_types_for_obligation(obl, by_school_type)
            if not required_types:
                continue
            school_key = _extract_school_context(obl.get("source_ref", "")) or "__no_school__"
            for req_type in required_types:
                candidates = by_school_type.get(school_key, {}).get(req_type, [])
                if not candidates and school_key != "__no_school__":
                    candidates = by_school_type.get("__no_school__", {}).get(req_type, [])
                for prereq in candidates:
                    edge = (obl["id"], prereq["id"])
                    if edge not in existing_edges:
                        edges_to_create.append({
                            "obligation_id": obl["id"],
                            "depends_on_obligation_id": prereq["id"],
                        })
                        existing_edges.add(edge)

        if edges_to_create:
            try:
                sb.table("obligation_dependencies").insert(edges_to_create).execute()
            except Exception as e:
                logger.warning(f"Some dependency edges may already exist (OK): {e}")

        obl_ids = [o["id"] for o in obligations]

        deps_res = sb.table("obligation_dependencies") \
            .select("obligation_id, depends_on_obligation_id") \
            .in_("obligation_id", obl_ids) \
            .execute()
        all_deps = deps_res.data or []

        overrides_res = sb.table("obligation_overrides") \
            .select("obligation_id, overridden_dependency_id, user_reason, created_at") \
            .in_("obligation_id", obl_ids) \
            .execute()
        all_overrides = overrides_res.data or []

        override_set: set[tuple[str, str]] = set()
        override_details: dict[str, list[dict]] = {}
        for ov in all_overrides:
            override_set.add((ov["obligation_id"], ov["overridden_dependency_id"]))
            override_details.setdefault(ov["obligation_id"], []).append(ov)

        dep_map: dict[str, list[str]] = {}
        for d in all_deps:
            dep_map.setdefault(d["obligation_id"], []).append(d["depends_on_obligation_id"])

        obl_by_id = {o["id"]: o for o in obligations}

        enriched = []
        for obl in obligations:
            deps = dep_map.get(obl["id"], [])
            blockers = []
            overridden_deps = []
            for dep_id in deps:
                dep_obl = obl_by_id.get(dep_id)
                if not dep_obl:
                    continue
                if dep_obl["status"] == "verified":
                    continue
                edge = (obl["id"], dep_id)
                if edge in override_set:
                    override_record = next(
                        (ov for ov in override_details.get(obl["id"], [])
                         if ov.get("overridden_dependency_id") == dep_id),
                        None,
                    )
                    overridden_deps.append({
                        **_blocker_payload(dep_obl),
                        "created_at": override_record.get("created_at") if override_record else None,
                    })
                else:
                    blockers.append(_blocker_payload(dep_obl))

            is_blocked = len(blockers) > 0
            enriched.append({
                **obl,
                "is_blocked": is_blocked,
                "blocked_by": blockers,
                "overridden_deps": overridden_deps,
            })

        return {"obligations": enriched, "count": len(enriched)}
    except Exception as e:
        logger.error(f"Obligations list error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ObligationStatusUpdateRequest(BaseModel):
    user_id: str
    status: str  # pending | submitted | verified | blocked | failed


class ObligationProofCreateRequest(BaseModel):
    user_id: str
    type: str  # receipt | confirmation_email | portal_screenshot | file_upload
    source_ref: str  # gmail_id | file_url | manual note


class AttachConfirmationEmailProofRequest(BaseModel):
    user_id: str
    analyzed_email_id: str  # analyzed_emails.id (NOT gmail_id)


_OBLIGATION_STATUSES = {"pending", "submitted", "verified", "blocked", "failed"}
_PROOF_TYPES = {"receipt", "confirmation_email", "portal_screenshot", "file_upload"}


def _looks_like_confirmation_email(subject: str, snippet: str, summary: str) -> bool:
    """
    Minimal heuristic: allow linking only when the email appears to be a receipt/confirmation.

    This is intentionally conservative. If it's not clearly a confirmation, block it.
    """
    text = " ".join([subject or "", snippet or "", summary or ""]).lower()
    keywords = [
        "confirmation",
        "confirmed",
        "receipt",
        "payment received",
        "we received",
        "we have received",
        "received your",
        "successfully submitted",
        "submission received",
        "application received",
        "deposit received",
        "thank you for your submission",
        "thank you for submitting",
    ]
    return any(k in text for k in keywords)


@app.post("/api/obligations/{obligation_id}/status")
async def update_obligation_status(obligation_id: str, request: ObligationStatusUpdateRequest):
    """
    Update canonical obligation status (Supabase-backed).

    Phase 1 Step 3 (Authority): "verified" is proof-gated server-side.
    Phase 2 Step 1 (Dependencies): "submitted"/"verified" are dependency-gated.
    Any path that attempts these without meeting prerequisites is INVALID and must be blocked.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        if request.status not in _OBLIGATION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")

        # Fetch obligation (ownership check)
        obligation_res = sb.table("obligations") \
            .select("*") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        obligation = getattr(obligation_res, "data", None)
        if not obligation:
            raise HTTPException(status_code=404, detail="Obligation not found")

        # Phase 3 Step 4: Irreversible transitions
        if obligation.get("status") in ("failed", "verified") and request.status != obligation.get("status"):
            raise HTTPException(
                status_code=409,
                detail=f"Irreversible: {obligation.get('status')} obligations cannot change status.",
            )

        # Phase 3 Step 4: Failure can only be recorded after deadline passed
        if request.status == "failed":
            if obligation.get("status") == "verified":
                raise HTTPException(status_code=409, detail="Irreversible: verified obligations cannot fail.")
            deadline = obligation.get("deadline")
            if not deadline:
                raise HTTPException(status_code=409, detail="Cannot mark failed without a deadline.")
            try:
                deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid deadline format.")
            if deadline_dt >= datetime.utcnow():
                raise HTTPException(status_code=409, detail="Cannot mark failed before deadline passes.")

        # Phase 2 Step 1 & 3: Dependency-gated transitions.
        # Cannot transition to submitted or verified if any dependency is unmet.
        # This is checked BEFORE proof-gating because dependencies are more fundamental.
        # Phase 2 Step 3: Overridden dependencies are excluded from blocking.
        if request.status in ("submitted", "verified"):
            deps_res = sb.table("obligation_dependencies") \
                .select("depends_on_obligation_id") \
                .eq("obligation_id", obligation_id) \
                .execute()
            dep_ids = [d["depends_on_obligation_id"] for d in (deps_res.data or [])]

            if dep_ids:
                # Phase 2 Step 3: Fetch overrides for this obligation
                overrides_res = sb.table("obligation_overrides") \
                    .select("overridden_dependency_id") \
                    .eq("obligation_id", obligation_id) \
                    .execute()
                overridden_ids = {
                    o["overridden_dependency_id"]
                    for o in (overrides_res.data or [])
                }

                # Fetch statuses of all dependency obligations
                dep_obls_res = sb.table("obligations") \
                    .select("id, type, title, status") \
                    .in_("id", dep_ids) \
                    .execute()
                dep_obls = dep_obls_res.data or []

                # Phase 2 Step 3: Only block on unmet dependencies that are NOT overridden
                unmet = [
                    d for d in dep_obls
                    if d["status"] != "verified"
                    and d["id"] not in overridden_ids
                ]
                if unmet:
                    blockers = [
                        f"{d['type']} (\"{d['title']}\", status: {d['status']})"
                        for d in unmet
                    ]
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Blocked: this obligation depends on {len(unmet)} unverified "
                            f"prerequisite(s) that must be completed first:\n"
                            + "\n".join(f"  - {b}" for b in blockers)
                        ),
                    )

        # Proof-gated verification (explicit, clear error)
        if request.status == "verified" and obligation.get("proof_required", False):
            proofs_res = sb.table("obligation_proofs") \
                .select("id") \
                .eq("obligation_id", obligation_id) \
                .limit(1) \
                .execute()
            proofs = getattr(proofs_res, "data", None) or []
            if len(proofs) == 0:
                raise HTTPException(
                    status_code=409,
                    detail="Blocked: proof is required to verify this obligation. Attach proof first.",
                )

        # Phase 4 Step 1: Steps gating for FAFSA/SCHOLARSHIP
        if request.status == "verified" and obligation.get("type") in ("FAFSA", "SCHOLARSHIP"):
            steps_res = sb.table("obligation_steps") \
                .select("id, status") \
                .eq("obligation_id", obligation_id) \
                .execute()
            steps = steps_res.data or []
            if steps:
                incomplete = [s for s in steps if s["status"] != "completed"]
                if incomplete:
                    raise HTTPException(
                        status_code=409,
                        detail="Blocked: all required steps must be completed before verification.",
                    )

        # Update (DB triggers also enforce proof-gating and dependency-gating as safety nets)
        updated_res = sb.table("obligations") \
            .update({"status": request.status}) \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .select("*") \
            .single() \
            .execute()

        updated = getattr(updated_res, "data", None)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update obligation")

        # Phase 4 Step 3: Controlled propagation (unblock only)
        if request.status == "verified":
            _propagate_unblock(sb, updated)

        return {"status": "updated", "obligation": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Obligation status update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/obligations/{obligation_id}/steps")
async def get_obligation_steps(obligation_id: str, user_id: str):
    """
    List ordered steps for an obligation.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Ownership check
        obl_res = sb.table("obligations") \
            .select("id, type") \
            .eq("id", obligation_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        steps_res = sb.table("obligation_steps") \
            .select("*") \
            .eq("obligation_id", obligation_id) \
            .order("created_at", desc=False) \
            .execute()

        return {"steps": steps_res.data or [], "count": len(steps_res.data or [])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get steps error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/obligations/{obligation_id}/steps/{step_id}/complete")
async def complete_obligation_step(obligation_id: str, step_id: str, user_id: str):
    """
    Mark a step as completed. Enforces strict order (next pending only).
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Ownership check
        obl_res = sb.table("obligations") \
            .select("id") \
            .eq("id", obligation_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        # Ensure the step belongs to the obligation
        step_res = sb.table("obligation_steps") \
            .select("id, status") \
            .eq("id", step_id) \
            .eq("obligation_id", obligation_id) \
            .single() \
            .execute()
        step = getattr(step_res, "data", None)
        if not step:
            raise HTTPException(status_code=404, detail="Step not found")
        if step.get("status") == "completed":
            return {"status": "completed", "step_id": step_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Complete step error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PHASE 6: NON-COOPERATIVE INPUTS ====================

class IntakePortalPasteRequest(BaseModel):
    user_id: str
    raw_text: str

class IntakeCreateRequest(BaseModel):
    user_id: str
    source: str  # portal_paste | screenshot | pdf

class IntakeOcrRequest(BaseModel):
    user_id: str
    bucket: str
    path: str
    upload_id: Optional[str] = None
    source: str  # screenshot | pdf

class IntakeConfirmRequest(BaseModel):
    user_id: str
    existing_obligation_id: Optional[str] = None


def _extract_deadline_candidate(text: str) -> Optional[str]:
    # Simple date patterns: YYYY-MM-DD or Month Day, Year
    import re
    m = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if m:
        return m.group(1)
    m = re.search(r'([A-Za-z]+\s+\d{1,2},\s+\d{4})', text)
    if m:
        return m.group(1)
    return None


def _extract_type_candidate(text: str) -> Optional[str]:
    t = text.lower()
    if 'fafsa' in t:
        return 'FAFSA'
    if 'application fee' in t:
        return 'APPLICATION_FEE'
    if 'application submission' in t or 'submit application' in t:
        return 'APPLICATION_SUBMISSION'
    if 'housing deposit' in t:
        return 'HOUSING_DEPOSIT'
    if 'enrollment deposit' in t:
        return 'ENROLLMENT_DEPOSIT'
    if 'scholarship acceptance' in t:
        return 'SCHOLARSHIP_ACCEPTANCE'
    if 'scholarship' in t:
        return 'SCHOLARSHIP'
    if 'acceptance' in t:
        return 'ACCEPTANCE'
    if 'enrollment' in t:
        return 'ENROLLMENT'
    return None


def _extract_institution_candidate(text: str) -> Optional[str]:
    # Minimal heuristic: look for "School:" or "Institution:"
    import re
    m = re.search(r'(School|Institution)\s*:\s*([^\r\n]+)', text, re.IGNORECASE)
    if m:
        return m.group(2).strip()
    return None


def _extract_candidates(raw_text: str) -> dict:
    deadline = _extract_deadline_candidate(raw_text)
    obl_type = _extract_type_candidate(raw_text)
    institution = _extract_institution_candidate(raw_text)
    confidence = 0.2
    if obl_type:
        confidence += 0.3
    if deadline:
        confidence += 0.3
    if institution:
        confidence += 0.2
    if confidence > 0.95:
        confidence = 0.95
    return {
        "obligation_type_candidate": obl_type,
        "institution_candidate": institution,
        "deadline_candidate": deadline,
        "confidence": confidence,
        "fields": {
            "raw_text": raw_text[:2000],
        }
    }


def _download_storage_file(sb, bucket: str, path: str) -> bytes:
    return sb.storage.from_(bucket).download(path)


def _ocr_text_from_bytes(blob: bytes, mime_type: str) -> str:
    if mime_type == 'application/pdf':
        try:
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(blob))
            return "\n".join([page.extract_text() or "" for page in reader.pages])
        except Exception:
            return ""
    try:
        from PIL import Image
        import pytesseract
        import io
        img = Image.open(io.BytesIO(blob))
        return pytesseract.image_to_string(img)
    except Exception:
        return ""


@app.post("/api/intake/portal-paste")
async def intake_portal_paste(req: IntakePortalPasteRequest):
    """Create intake item from pasted portal text and extract candidates."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        item_res = sb.table("intake_items").insert({
            "user_id": req.user_id,
            "source": "portal_paste",
            "raw_text": req.raw_text,
            "status": "pending",
        }).select("*").single().execute()
        item = getattr(item_res, "data", None)
        if not item:
            raise HTTPException(status_code=500, detail="Failed to create intake item")

        extraction = _extract_candidates(req.raw_text)
        sb.table("intake_extractions").insert({
            "intake_item_id": item["id"],
            **extraction,
        }).execute()
        sb.table("intake_items").update({"status": "extracted"}).eq("id", item["id"]).execute()

        return {"intake_item": item, "extraction": extraction}
    except Exception as e:
        logger.error(f"Portal paste intake error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intake/create")
async def intake_create(req: IntakeCreateRequest):
    """Create intake item placeholder (for uploads)."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()
        if req.source not in ("screenshot", "pdf"):
            raise HTTPException(status_code=400, detail="Invalid source")

        item_res = sb.table("intake_items").insert({
            "user_id": req.user_id,
            "source": req.source,
            "status": "pending",
        }).select("*").single().execute()
        item = getattr(item_res, "data", None)
        if not item:
            raise HTTPException(status_code=500, detail="Failed to create intake item")
        return {"intake_item": item}
    except Exception as e:
        logger.error(f"Intake create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intake/{intake_item_id}/ocr")
async def intake_ocr(intake_item_id: str, req: IntakeOcrRequest):
    """Run OCR on an uploaded file and extract candidates."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        item_res = sb.table("intake_items").select("*").eq("id", intake_item_id).eq("user_id", req.user_id).single().execute()
        item = getattr(item_res, "data", None)
        if not item:
            raise HTTPException(status_code=404, detail="Intake item not found")

        blob = _download_storage_file(sb, req.bucket, req.path)
        mime_type = "application/pdf" if req.source == "pdf" else "image"
        text = _ocr_text_from_bytes(blob, mime_type)
        if not text:
            sb.table("intake_items").update({"status": "error"}).eq("id", intake_item_id).execute()
            raise HTTPException(status_code=422, detail="OCR produced no text")

        sb.table("intake_items").update({
            "raw_text": text,
            "upload_id": req.upload_id,
            "status": "extracted",
        }).eq("id", intake_item_id).execute()

        extraction = _extract_candidates(text)
        sb.table("intake_extractions").insert({
            "intake_item_id": intake_item_id,
            **extraction,
        }).execute()

        return {"intake_item_id": intake_item_id, "extraction": extraction}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Intake OCR error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intake/{intake_item_id}/confirm")
async def intake_confirm(intake_item_id: str, req: IntakeConfirmRequest):
    """Confirm extraction: create or link obligation. No auto-create without confirmation."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        item_res = sb.table("intake_items").select("*").eq("id", intake_item_id).eq("user_id", req.user_id).single().execute()
        item = getattr(item_res, "data", None)
        if not item:
            raise HTTPException(status_code=404, detail="Intake item not found")

        ext_res = sb.table("intake_extractions").select("*").eq("intake_item_id", intake_item_id).order("created_at", desc=True).limit(1).execute()
        ext = (ext_res.data or [None])[0]
        if not ext:
            raise HTTPException(status_code=404, detail="No extraction found")

        cand_type = ext.get("obligation_type_candidate")
        if not cand_type or cand_type not in _OBLIGATION_TYPES:
            raise HTTPException(status_code=400, detail="Insufficient obligation type candidate")

        deadline = ext.get("deadline_candidate")
        institution = ext.get("institution_candidate")

        target_obl = None
        if req.existing_obligation_id:
            target_res = sb.table("obligations").select("*").eq("id", req.existing_obligation_id).eq("user_id", req.user_id).single().execute()
            target_obl = getattr(target_res, "data", None)
            if not target_obl:
                raise HTTPException(status_code=404, detail="Existing obligation not found")
        else:
            # Deduplicate by type + deadline window (+ optional institution in title)
            query = sb.table("obligations").select("*").eq("user_id", req.user_id).eq("type", cand_type)
            candidates = query.execute().data or []
            matches = []
            for o in candidates:
                if institution and institution.lower() not in (o.get("title", "").lower()):
                    continue
                if deadline and o.get("deadline"):
                    # simple window: +/- 30 days on date string
                    matches.append(o)
                elif deadline is None:
                    matches.append(o)
            if matches:
                target_obl = matches[0]

        if not target_obl:
            title = institution + " - " + cand_type if institution else cand_type
            insert_payload = {
                "user_id": req.user_id,
                "type": cand_type,
                "title": title,
                "source": "manual",
                "source_ref": f"intake:{intake_item_id}",
                "deadline": deadline,
                "status": "pending",
                "proof_required": False,
            }
            new_res = sb.table("obligations").insert(insert_payload).select("*").single().execute()
            target_obl = getattr(new_res, "data", None)

        # Link upload as evidence if present
        if item.get("upload_id"):
            upload_res = sb.table("uploads").select("*").eq("id", item.get("upload_id")).single().execute()
            upload = getattr(upload_res, "data", None)
            if upload:
                sb.table("obligation_proofs").insert({
                    "obligation_id": target_obl["id"],
                    "type": "portal_screenshot",
                    "source_ref": upload.get("path"),
                }).execute()

        sb.table("intake_items").update({"status": "confirmed"}).eq("id", intake_item_id).execute()
        return {"status": "confirmed", "obligation": target_obl}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Intake confirm error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intake/{intake_item_id}/discard")
async def intake_discard(intake_item_id: str, user_id: str):
    """Discard intake item."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()
        sb.table("intake_items").update({"status": "discarded"}).eq("id", intake_item_id).eq("user_id", user_id).execute()
        return {"status": "discarded"}
    except Exception as e:
        logger.error(f"Intake discard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


        # Enforce order: only earliest pending step can be completed
        pending_res = sb.table("obligation_steps") \
            .select("id") \
            .eq("obligation_id", obligation_id) \
            .eq("status", "pending") \
            .order("created_at", desc=False) \
            .limit(1) \
            .execute()
        pending = pending_res.data or []
        if pending and pending[0]["id"] != step_id:
            raise HTTPException(status_code=409, detail="Out of order: complete the next pending step first.")

        updated_res = sb.table("obligation_steps") \
            .update({"status": "completed", "completed_at": datetime.utcnow().isoformat()}) \
            .eq("id", step_id) \
            .eq("obligation_id", obligation_id) \
            .select("*") \
            .single() \
            .execute()
        updated = getattr(updated_res, "data", None)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to complete step")

        return {"status": "completed", "step": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Complete step error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ObligationReattemptRequest(BaseModel):
    user_id: str
    new_deadline: Optional[str] = None  # ISO date or timestamp
    title: Optional[str] = None


@app.post("/api/obligations/{obligation_id}/reattempt")
async def reattempt_obligation(obligation_id: str, request: ObligationReattemptRequest):
    """
    Create a new obligation linked to a failed one.
    The failed obligation remains unchanged.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Fetch failed obligation (ownership check)
        obl_res = sb.table("obligations") \
            .select("*") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        obl = getattr(obl_res, "data", None)
        if not obl:
            raise HTTPException(status_code=404, detail="Obligation not found")
        if obl.get("status") != "failed":
            raise HTTPException(status_code=409, detail="Only failed obligations can be reattempted.")

        # Build new obligation
        now = datetime.utcnow().isoformat()
        source_ref = f"reattempt:{obligation_id}:{now}"
        insert_payload = {
            "user_id": request.user_id,
            "type": obl["type"],
            "title": request.title or obl["title"],
            "source": "manual",
            "source_ref": source_ref,
            "deadline": request.new_deadline,
            "status": "pending",
            "proof_required": obl.get("proof_required", False),
            "prior_failed_obligation_id": obligation_id,
        }

        new_res = sb.table("obligations") \
            .insert(insert_payload) \
            .select("*") \
            .single() \
            .execute()
        new_obl = getattr(new_res, "data", None)
        if not new_obl:
            raise HTTPException(status_code=500, detail="Failed to create reattempt obligation")

        # Append audit records (append-only)
        sb.table("obligation_history").insert([
            {
                "obligation_id": obligation_id,
                "user_id": request.user_id,
                "event_type": "reattempt_created",
                "reason": f"reattempt_obligation_id:{new_obl['id']}",
            },
            {
                "obligation_id": new_obl["id"],
                "user_id": request.user_id,
                "event_type": "reattempt_created",
                "reason": f"prior_failed_obligation_id:{obligation_id}",
            },
        ]).execute()

        return {"status": "created", "obligation": new_obl}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reattempt creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/obligations/{obligation_id}/history")
async def get_obligation_history(obligation_id: str, user_id: str):
    """
    Return append-only history for an obligation.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        obl_res = sb.table("obligations") \
            .select("id") \
            .eq("id", obligation_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        hist_res = sb.table("obligation_history") \
            .select("*") \
            .eq("obligation_id", obligation_id) \
            .order("created_at", desc=True) \
            .execute()

        return {"history": hist_res.data or [], "count": len(hist_res.data or [])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Obligation history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/obligations/{obligation_id}/proofs")
async def create_obligation_proof(obligation_id: str, request: ObligationProofCreateRequest):
    """
    Append a proof artifact to an obligation.

    Proofs are append-only by database rule.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        proof_type = (request.type or "").strip()
        source_ref = (request.source_ref or "").strip()
        if proof_type not in _PROOF_TYPES:
            raise HTTPException(status_code=400, detail="Invalid proof type")
        if not source_ref:
            raise HTTPException(status_code=400, detail="source_ref is required")

        obligation_res = sb.table("obligations") \
            .select("id") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        if not getattr(obligation_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        inserted_res = sb.table("obligation_proofs").insert({
            "obligation_id": obligation_id,
            "type": proof_type,
            "source_ref": source_ref,
        }).select("*").single().execute()

        inserted = getattr(inserted_res, "data", None)
        if not inserted:
            raise HTTPException(status_code=500, detail="Failed to create proof")

        return {"status": "created", "proof": inserted}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/obligations/{obligation_id}/proofs/attach-confirmation-email")
async def attach_confirmation_email_as_proof(obligation_id: str, request: AttachConfirmationEmailProofRequest):
    """
    Attach a confirmation/receipt email as proof.

    IMPORTANT:
    - Does NOT auto-verify.
    - Requires explicit user action (this endpoint is the explicit attach).
    - Blocks if the email does not look like a confirmation.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Ownership check
        obligation_res = sb.table("obligations") \
            .select("id") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        if not getattr(obligation_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        email_res = sb.table("analyzed_emails") \
            .select("id,gmail_id,subject,snippet,summary") \
            .eq("id", request.analyzed_email_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        email = getattr(email_res, "data", None)
        if not email:
            raise HTTPException(status_code=404, detail="Analyzed email not found")

        gmail_id = email.get("gmail_id")
        if not gmail_id:
            raise HTTPException(status_code=400, detail="Email has no gmail_id; cannot attach as confirmation proof")

        if not _looks_like_confirmation_email(email.get("subject"), email.get("snippet"), email.get("summary")):
            raise HTTPException(
                status_code=400,
                detail="Blocked: email does not look like a receipt/confirmation; refusing to attach as confirmation_email proof.",
            )

        inserted_res = sb.table("obligation_proofs").insert({
            "obligation_id": obligation_id,
            "type": "confirmation_email",
            "source_ref": gmail_id,
        }).select("*").single().execute()

        inserted = getattr(inserted_res, "data", None)
        if not inserted:
            raise HTTPException(status_code=500, detail="Failed to attach proof")

        return {"status": "attached", "proof": inserted}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Attach confirmation email proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== EMAIL DRAFTING & APPROVAL ENDPOINTS ====================

class DraftEmailRequest(BaseModel):
    user_id: str
    school_id: str
    document_id: Optional[str] = None
    draft_type: str = "follow_up"  # "follow_up" | "status_inquiry"
    inquiry_type: Optional[str] = "general"  # "general" | "timeline" | "missing_documents"

class ImproveDraftRequest(BaseModel):
    user_id: str
    follow_up_id: str
    feedback: str

class SendEmailRequest(BaseModel):
    user_id: str
    follow_up_id: str
    edited_content: Optional[str] = None
    edited_subject: Optional[str] = None

class CancelDraftRequest(BaseModel):
    user_id: str
    follow_up_id: str


@app.post("/api/draft/create")
async def create_draft(request: DraftEmailRequest):
    """Generate an AI email draft and store it as a pending follow-up in Supabase."""
    try:
        from backend.email_drafter import draft_follow_up_email, draft_status_inquiry_email
        from backend.email_monitor import _get_supabase

        sb = _get_supabase()

        # Get school info
        school_result = sb.table("schools").select("*").eq("id", request.school_id).single().execute()
        school = school_result.data
        if not school:
            raise HTTPException(status_code=404, detail="School not found")

        # Get user profile
        profile_result = sb.table("profiles").select("*").eq("id", request.user_id).single().execute()
        profile = profile_result.data or {}
        student_name = profile.get("full_name") or profile.get("email", "Student")
        student_email = profile.get("email", "")

        document_name = None
        deadline = None
        if request.document_id:
            doc_result = sb.table("documents").select("*").eq("id", request.document_id).single().execute()
            if doc_result.data:
                document_name = doc_result.data["name"]
                deadline = doc_result.data.get("deadline")

        # Draft the email
        if request.draft_type == "follow_up" and document_name:
            result = draft_follow_up_email(
                school_name=school["name"],
                document_name=document_name,
                deadline=deadline,
                student_name=student_name,
            )
        else:
            result = draft_status_inquiry_email(
                school_name=school["name"],
                student_name=student_name,
                student_email=student_email,
                inquiry_type=request.inquiry_type or "general",
            )

        subject = result.get("subject", f"Re: {school['name']} Financial Aid")
        body = result.get("body", "")

        # Store in follow_ups table
        follow_up = sb.table("follow_ups").insert({
            "user_id": request.user_id,
            "school_id": request.school_id,
            "document_id": request.document_id,
            "follow_up_type": request.draft_type,
            "status": "pending_approval",
            "drafted_content": body,
            "subject": subject,
            "recipient_email": school.get("notes", ""),  # TODO: store fin-aid email in school record
            "metadata": {
                "school_name": school["name"],
                "document_name": document_name,
                "student_name": student_name,
            },
        }).execute()

        return {"status": "drafted", "follow_up": follow_up.data[0] if follow_up.data else None}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/draft/improve")
async def improve_draft_endpoint(request: ImproveDraftRequest):
    """Improve an existing draft based on user feedback using Claude."""
    try:
        from backend.email_drafter import improve_draft
        from backend.email_monitor import _get_supabase

        sb = _get_supabase()

        # Get original draft
        result = sb.table("follow_ups").select("*").eq("id", request.follow_up_id).eq("user_id", request.user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Draft not found")

        original = result.data["edited_content"] or result.data["drafted_content"]
        improved = improve_draft(original, request.feedback)

        # Update
        sb.table("follow_ups").update({
            "edited_content": improved,
        }).eq("id", request.follow_up_id).execute()

        return {"status": "improved", "content": improved}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft improve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/draft/send")
async def send_draft(request: SendEmailRequest):
    """Approve and send a draft email via Gmail."""
    try:
        from backend.email_sender import EmailSender
        from backend.email_monitor import _get_supabase

        sb = _get_supabase()

        # Ensure the user has a connected Gmail account.
        conn_result = (
            sb.table("email_connections")
            .select("*")
            .eq("user_id", request.user_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
        connection = conn_result.data
        if not connection:
            raise HTTPException(status_code=400, detail="Gmail not connected. Connect Gmail first.")

        # Get the follow-up
        result = sb.table("follow_ups").select("*").eq("id", request.follow_up_id).eq("user_id", request.user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Draft not found")

        follow_up = result.data
        final_content = request.edited_content or follow_up.get("edited_content") or follow_up["drafted_content"]
        final_subject = request.edited_subject or follow_up.get("subject", "Financial Aid Inquiry")
        recipient = follow_up.get("recipient_email", "")

        if not recipient:
            raise HTTPException(status_code=400, detail="No recipient email. Set it before sending.")

        # Send via Gmail
        sender = EmailSender(
            access_token=connection["access_token"],
            refresh_token=connection.get("refresh_token"),
            token_expiry=connection.get("token_expiry"),
        )
        message_id = sender.send_email(
            to=recipient,
            subject=final_subject,
            body=final_content,
        )

        # Persist refreshed access token/expiry if the sender refreshed it.
        try:
            sb.table("email_connections").update(
                {
                    "access_token": sender.access_token,
                    "token_expiry": sender.token_expiry,
                }
            ).eq("user_id", request.user_id).execute()
        except Exception:
            # Non-fatal; email was sent.
            pass

        # Update status
        sb.table("follow_ups").update({
            "status": "sent",
            "edited_content": final_content,
            "subject": final_subject,
            "sent_at": datetime.now().isoformat(),
            "sent_message_id": message_id,
        }).eq("id", request.follow_up_id).execute()

        return {"status": "sent", "message_id": message_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft send error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/draft/cancel")
async def cancel_draft(request: CancelDraftRequest):
    """Cancel a pending draft."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()
        sb.table("follow_ups").update({"status": "cancelled"}).eq("id", request.follow_up_id).eq("user_id", request.user_id).execute()
        return {"status": "cancelled"}
    except Exception as e:
        logger.error(f"Draft cancel error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/draft/pending")
async def get_pending_drafts(user_id: str):
    """Get all pending-approval drafts for a user."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()
        result = sb.table("follow_ups").select("*").eq("user_id", user_id).eq("status", "pending_approval").order("created_at", desc=True).execute()
        return {"drafts": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Pending drafts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/draft/history")
async def get_draft_history(user_id: str):
    """Get all follow-ups (all statuses) for a user."""
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()
        result = sb.table("follow_ups").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
        return {"drafts": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Draft history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PHASE 1 STEP 4: PROOF-MISSING DETECTION & RECOVERY DRAFTS ====================
#
# GUARDRAILS (enforced here, not negotiable):
# - No auto-sending. Drafts are ALWAYS stored as pending_approval.
# - No chaining. One draft per unmet proof-missing condition unless user triggers another.
# - No auto-verification. Sending the follow-up does NOT mark the obligation as verified.
# - If something feels "smart" — it was removed.
#

# Configurable threshold (hours). Default: 48 hours after submission.
PROOF_MISSING_THRESHOLD_HOURS = int(os.getenv("PROOF_MISSING_THRESHOLD_HOURS", "48"))


@app.get("/api/obligations/proof-missing")
async def detect_proof_missing_obligations(user_id: str):
    """
    Detect obligations stuck in "submitted" without proof.

    Condition:
    - obligation.status = "submitted"
    - obligation.proof_required = true
    - no rows in obligation_proofs for this obligation
    - submitted_at is older than PROOF_MISSING_THRESHOLD_HOURS (default 48h)

    Returns list of obligations meeting this condition, annotated with
    whether a recovery draft already exists.

    THIS ENDPOINT DOES NOT SEND ANYTHING. It only detects.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # 1. Get all submitted + proof-required obligations for this user
        obl_result = sb.table("obligations") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "submitted") \
            .eq("proof_required", True) \
            .execute()

        candidates = obl_result.data or []
        if not candidates:
            return {"obligations": [], "count": 0}

        # 2. Filter by elapsed time since submission
        threshold = timedelta(hours=PROOF_MISSING_THRESHOLD_HOURS)
        now = datetime.utcnow()
        stale = []
        for obl in candidates:
            submitted_at = obl.get("submitted_at")
            if not submitted_at:
                continue
            try:
                submitted_dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                continue
            if (now - submitted_dt) >= threshold:
                stale.append(obl)

        if not stale:
            return {"obligations": [], "count": 0}

        # 3. Check which have NO proofs
        stale_ids = [o["id"] for o in stale]
        proofs_result = sb.table("obligation_proofs") \
            .select("obligation_id") \
            .in_("obligation_id", stale_ids) \
            .execute()
        has_proof_ids = {p["obligation_id"] for p in (proofs_result.data or [])}

        proof_missing = [o for o in stale if o["id"] not in has_proof_ids]

        if not proof_missing:
            return {"obligations": [], "count": 0}

        # 4. Guardrail: check which already have an active recovery draft (one per condition)
        pm_ids = [o["id"] for o in proof_missing]
        existing_drafts = sb.table("follow_ups") \
            .select("obligation_id") \
            .eq("user_id", user_id) \
            .eq("follow_up_type", "obligation_proof_missing") \
            .in_("status", ["pending_approval", "draft"]) \
            .in_("obligation_id", pm_ids) \
            .execute()
        has_draft_ids = {d["obligation_id"] for d in (existing_drafts.data or [])}

        # Annotate each obligation
        result = []
        for obl in proof_missing:
            obl["_has_recovery_draft"] = obl["id"] in has_draft_ids
            try:
                hours = (now - datetime.fromisoformat(obl["submitted_at"].replace("Z", "+00:00")).replace(tzinfo=None)).total_seconds() / 3600
                obl["_hours_since_submission"] = round(hours, 1)
            except Exception:
                obl["_hours_since_submission"] = None
            result.append(obl)

        return {"obligations": result, "count": len(result)}
    except Exception as e:
        logger.error(f"Proof-missing detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GenerateRecoveryDraftsRequest(BaseModel):
    user_id: str
    obligation_ids: Optional[list] = None  # if None, generate for ALL proof-missing obligations


@app.post("/api/obligations/generate-recovery-drafts")
async def generate_recovery_drafts(request: GenerateRecoveryDraftsRequest):
    """
    Generate follow-up email drafts for proof-missing obligations.

    GUARDRAILS:
    - Drafts are stored as "pending_approval". NEVER auto-sent.
    - Only ONE draft per obligation (skips if one already exists).
    - Does NOT mark obligation as verified. Proof still requires confirmation evidence.
    - Does NOT chain follow-ups automatically.

    This endpoint is triggered by the user reviewing the "follow-up recommended" state.
    """
    try:
        from backend.email_drafter import draft_follow_up_email
        from backend.email_monitor import _get_supabase

        sb = _get_supabase()

        # 1. Detect proof-missing obligations
        obl_query = sb.table("obligations") \
            .select("*") \
            .eq("user_id", request.user_id) \
            .eq("status", "submitted") \
            .eq("proof_required", True)

        if request.obligation_ids:
            obl_query = obl_query.in_("id", request.obligation_ids)

        obl_result = obl_query.execute()
        candidates = obl_result.data or []

        if not candidates:
            return {"drafts_created": 0, "skipped": 0}

        # 2. Filter: must have no proofs
        candidate_ids = [o["id"] for o in candidates]
        proofs_result = sb.table("obligation_proofs") \
            .select("obligation_id") \
            .in_("obligation_id", candidate_ids) \
            .execute()
        has_proof_ids = {p["obligation_id"] for p in (proofs_result.data or [])}
        proof_missing = [o for o in candidates if o["id"] not in has_proof_ids]

        # 3. Guardrail: skip obligations that already have an active draft
        pm_ids = [o["id"] for o in proof_missing]
        has_draft_ids = set()
        if pm_ids:
            existing_drafts = sb.table("follow_ups") \
                .select("obligation_id") \
                .eq("user_id", request.user_id) \
                .eq("follow_up_type", "obligation_proof_missing") \
                .in_("status", ["pending_approval", "draft"]) \
                .in_("obligation_id", pm_ids) \
                .execute()
            has_draft_ids = {d["obligation_id"] for d in (existing_drafts.data or [])}

        # 4. Get user profile
        profile_result = sb.table("profiles").select("*").eq("id", request.user_id).single().execute()
        profile = profile_result.data or {}
        student_name = profile.get("full_name") or profile.get("email", "Student")

        drafts_created = 0
        skipped = 0

        for obl in proof_missing:
            # Guardrail: one draft per condition
            if obl["id"] in has_draft_ids:
                skipped += 1
                continue

            # Resolve school name from source_ref
            school_name = "the financial aid office"
            school_id = None
            source_ref = obl.get("source_ref", "")
            if source_ref.startswith("school:"):
                parts = source_ref.split(":")
                if len(parts) >= 2:
                    school_id = parts[1]
                    try:
                        school_result = sb.table("schools").select("name").eq("id", school_id).single().execute()
                        if school_result.data:
                            school_name = school_result.data["name"]
                    except Exception:
                        pass
            elif source_ref.startswith("document:"):
                doc_id = source_ref.split(":")[1] if ":" in source_ref else None
                if doc_id:
                    try:
                        doc_result = sb.table("documents").select("school_id").eq("id", doc_id).single().execute()
                        if doc_result.data:
                            school_id = doc_result.data["school_id"]
                            school_result = sb.table("schools").select("name").eq("id", school_id).single().execute()
                            if school_result.data:
                                school_name = school_result.data["name"]
                    except Exception:
                        pass

            submitted_at = obl.get("submitted_at", "")
            try:
                submitted_date = datetime.fromisoformat(submitted_at.replace("Z", "+00:00")).strftime("%B %d, %Y")
            except Exception:
                submitted_date = "recently"

            # Generate draft — administrative, neutral, non-accusatory
            result = draft_follow_up_email(
                school_name=school_name,
                document_name=obl["title"],
                deadline=obl.get("deadline"),
                context=f"Submitted on {submitted_date}. No confirmation received yet.",
                student_name=student_name,
            )

            subject = result.get("subject", f"Following up: {obl['title']}")
            body = result.get("body", "")

            # Store as pending_approval — NEVER auto-send
            sb.table("follow_ups").insert({
                "user_id": request.user_id,
                "school_id": school_id,
                "obligation_id": obl["id"],
                "follow_up_type": "obligation_proof_missing",
                "status": "pending_approval",
                "drafted_content": body,
                "subject": subject,
                "recipient_email": "",  # User must fill in before sending
                "metadata": {
                    "school_name": school_name,
                    "obligation_title": obl["title"],
                    "student_name": student_name,
                    "submitted_at": submitted_at,
                    "auto_generated": True,
                    "reason": "proof_missing_after_threshold",
                },
            }).execute()

            drafts_created += 1

        return {"drafts_created": drafts_created, "skipped": skipped}
    except Exception as e:
        logger.error(f"Generate recovery drafts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ====================================================================================
# PHASE 2 STEP 1: OBLIGATION DEPENDENCIES (hardcoded ordering constraints)
# ====================================================================================
#
# WHY DEPENDENCIES ARE HARDCODED:
# The real world has ordering constraints that cannot be violated.
# You cannot deposit for housing before being accepted.
# You cannot submit an application before paying the fee.
# These are FACTS, not predictions. There is no AI here and there must never be.
#
# WHY AI INFERENCE IS INTENTIONALLY AVOIDED:
# AI would try to "discover" dependencies from data patterns.
# That is wrong. A student who pays a fee after submitting (by mistake)
# does not create a new valid ordering. The constraint is physical, not statistical.
#
# WHY THIS IS SAFER THAN "SMART" AUTOMATION:
# A hardcoded map can be audited in 30 seconds.
# An inferred dependency graph requires explaining the model.
# If there is doubt, block. That is the rule.
#
# DEFAULT BIAS: If there is doubt, block.
# ====================================================================================

# Static dependency map: type -> list of required prerequisite types.
# These are the ONLY valid ordering constraints.
# Do not add to this map without a real-world justification.
# Do not infer new edges from data.
OBLIGATION_DEPENDENCY_MAP: dict[str, list[str]] = {
    "APPLICATION_SUBMISSION": ["APPLICATION_FEE"],
    "HOUSING_DEPOSIT": ["ACCEPTANCE"],
    "SCHOLARSHIP_DISBURSEMENT": ["SCHOLARSHIP"],
    "ENROLLMENT": ["FAFSA"],
    "SCHOLARSHIP_ACCEPTANCE": ["ACCEPTANCE"],
}

# Extended obligation types (Phase 2 Step 1)
_OBLIGATION_TYPES = {
    "FAFSA", "APPLICATION_FEE", "APPLICATION_SUBMISSION",
    "HOUSING_DEPOSIT", "SCHOLARSHIP",
    "ACCEPTANCE", "SCHOLARSHIP_DISBURSEMENT", "ENROLLMENT",
    "ENROLLMENT_DEPOSIT", "SCHOLARSHIP_ACCEPTANCE",
}

# Phase 4 Step 3: Controlled state propagation (exact rules only)
PROPAGATION_RULES = {
    "APPLICATION_SUBMISSION": ["HOUSING_DEPOSIT"],
    "FAFSA": ["SCHOLARSHIP"],
}


def _extract_school_context(source_ref: str) -> Optional[str]:
    """
    Extract school context from obligation source_ref.

    Patterns:
    - school:{uuid}:* -> uuid
    - document:{uuid} -> None (would require DB lookup; not done here for simplicity)

    Returns school_id string or None.
    """
    if not source_ref:
        return None
    if source_ref.startswith("school:"):
        parts = source_ref.split(":")
        if len(parts) >= 2:
            return parts[1]
    return None


def _required_types_for_obligation(obl: dict, by_school_type: dict[str, dict[str, list[dict]]]) -> list[str]:
    """
    Dependency rules with one conditional:
    HOUSING_DEPOSIT requires ENROLLMENT_DEPOSIT if it exists in the same context,
    otherwise requires ACCEPTANCE.
    """
    obl_type = obl.get("type")
    required = OBLIGATION_DEPENDENCY_MAP.get(obl_type, [])
    if obl_type == "HOUSING_DEPOSIT":
        ctx = _extract_school_context(obl.get("source_ref", "")) or "__no_school__"
        has_enrollment_deposit = len(by_school_type.get(ctx, {}).get("ENROLLMENT_DEPOSIT", [])) > 0
        return ["ENROLLMENT_DEPOSIT"] if has_enrollment_deposit else ["ACCEPTANCE"]
    return required


def _blocker_payload(dep_obl: dict) -> dict:
    return {
        "obligation_id": dep_obl["id"],
        "type": dep_obl["type"],
        "title": dep_obl["title"],
        "status": dep_obl["status"],
        "institution": _extract_school_context(dep_obl.get("source_ref", "")),
        "deadline": dep_obl.get("deadline"),
    }


def _obligation_school_key(obl: dict) -> str:
    ctx = _extract_school_context(obl.get("source_ref", ""))
    return ctx or "__no_school__"


def _can_unblock_obligation(sb, obligation_id: str) -> bool:
    """
    Return True if no unmet (non-overridden) dependencies remain.
    """
    deps_res = sb.table("obligation_dependencies") \
        .select("depends_on_obligation_id") \
        .eq("obligation_id", obligation_id) \
        .execute()
    dep_ids = [d["depends_on_obligation_id"] for d in (deps_res.data or [])]
    if not dep_ids:
        return True

    overrides_res = sb.table("obligation_overrides") \
        .select("overridden_dependency_id") \
        .eq("obligation_id", obligation_id) \
        .execute()
    overridden_ids = {o["overridden_dependency_id"] for o in (overrides_res.data or [])}

    dep_obls_res = sb.table("obligations") \
        .select("id, status") \
        .in_("id", dep_ids) \
        .execute()
    dep_obls = dep_obls_res.data or []

    unmet = [
        d for d in dep_obls
        if d["status"] != "verified" and d["id"] not in overridden_ids
    ]
    return len(unmet) == 0


def _propagate_unblock(sb, source_obl: dict) -> list[str]:
    """
    Controlled propagation: unblocks dependents only (no submit/verify).
    Returns list of obligation IDs unblocked.
    """
    source_type = source_obl.get("type")
    target_types = PROPAGATION_RULES.get(source_type, [])
    if not target_types:
        return []

    # Scope by school context if present
    source_key = _obligation_school_key(source_obl)

    # Fetch candidate targets
    targets_res = sb.table("obligations") \
        .select("*") \
        .eq("user_id", source_obl["user_id"]) \
        .in_("type", target_types) \
        .execute()
    targets = targets_res.data or []

    unblocked_ids = []
    for t in targets:
        if t.get("status") != "blocked":
            continue
        # Match school context if source has one
        if source_key != "__no_school__" and _obligation_school_key(t) != source_key:
            continue
        if not _can_unblock_obligation(sb, t["id"]):
            continue

        sb.table("obligations") \
            .update({"status": "pending"}) \
            .eq("id", t["id"]) \
            .execute()
        unblocked_ids.append(t["id"])

        # Audit propagation
        sb.table("obligation_history").insert({
            "obligation_id": t["id"],
            "user_id": t["user_id"],
            "event_type": "propagation_unblocked",
            "reason": f"source_obligation_id:{source_obl['id']}",
            "actor_user_id": source_obl["user_id"],
        }).execute()

    return unblocked_ids


@app.get("/api/obligations/dependencies")
async def evaluate_obligation_dependencies(user_id: str):
    """
    Evaluate dependency state for all obligations belonging to a user.

    For each obligation:
    1. Check the static dependency map for required prerequisite types.
    2. Find matching prerequisite obligations (same user, same school context).
    3. Auto-create dependency edges if they don't exist.
    4. Return blocked state and blocking reasons.

    This endpoint creates dependency edges deterministically from the hardcoded map.
    It does NOT infer new rules. It does NOT use AI.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Fetch all obligations for this user
        obl_res = sb.table("obligations") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        all_obligations = obl_res.data or []

        if not all_obligations:
            return {"obligations": [], "dependencies_created": 0}

        # Group obligations by school context for matching
        by_school: dict[str, list[dict]] = {}
        for obl in all_obligations:
            ctx = _extract_school_context(obl.get("source_ref", ""))
            key = ctx or "__no_school__"
            by_school.setdefault(key, []).append(obl)

        # Also index by type within school context for fast lookup
        by_school_type: dict[str, dict[str, list[dict]]] = {}
        for school_key, obls in by_school.items():
            by_school_type[school_key] = {}
            for obl in obls:
                by_school_type[school_key].setdefault(obl["type"], []).append(obl)

        # Fetch existing dependency edges
        obl_ids = [o["id"] for o in all_obligations]
        existing_deps_res = sb.table("obligation_dependencies") \
            .select("*") \
            .in_("obligation_id", obl_ids) \
            .execute()
        existing_deps = existing_deps_res.data or []
        existing_edges = {(d["obligation_id"], d["depends_on_obligation_id"]) for d in existing_deps}

        # Auto-create edges from the hardcoded dependency map
        edges_to_create = []
        for obl in all_obligations:
            required_types = _required_types_for_obligation(obl, by_school_type)
            if not required_types:
                continue

            school_key = _extract_school_context(obl.get("source_ref", "")) or "__no_school__"

            for req_type in required_types:
                # Find prerequisite obligations in the same school context
                candidates = by_school_type.get(school_key, {}).get(req_type, [])

                # If no candidates in same school, check global (no-school) context
                if not candidates and school_key != "__no_school__":
                    candidates = by_school_type.get("__no_school__", {}).get(req_type, [])

                for prereq in candidates:
                    edge = (obl["id"], prereq["id"])
                    if edge not in existing_edges:
                        edges_to_create.append({
                            "obligation_id": obl["id"],
                            "depends_on_obligation_id": prereq["id"],
                        })
                        existing_edges.add(edge)

        # Batch insert new edges
        deps_created = 0
        if edges_to_create:
            try:
                sb.table("obligation_dependencies").insert(edges_to_create).execute()
                deps_created = len(edges_to_create)
            except Exception as e:
                logger.warning(f"Some dependency edges may already exist (OK): {e}")

        # Now compute blocked state for each obligation
        # Re-fetch all dependencies after potential inserts
        all_deps_res = sb.table("obligation_dependencies") \
            .select("obligation_id, depends_on_obligation_id") \
            .in_("obligation_id", obl_ids) \
            .execute()
        all_deps = all_deps_res.data or []

        # Phase 2 Step 3: Fetch all overrides for these obligations.
        # Overrides remove specific dependency edges from blocking computation.
        # They do NOT remove the dependency itself — just the hard block.
        overrides_res = sb.table("obligation_overrides") \
            .select("obligation_id, overridden_dependency_id, user_reason, created_at") \
            .in_("obligation_id", obl_ids) \
            .execute()
        all_overrides = overrides_res.data or []

        # Build override lookup: set of (obligation_id, overridden_dependency_id) tuples
        override_set: set[tuple[str, str]] = set()
        override_details: dict[str, list[dict]] = {}  # obligation_id -> list of override records
        for ov in all_overrides:
            override_set.add((ov["obligation_id"], ov["overridden_dependency_id"]))
            override_details.setdefault(ov["obligation_id"], []).append(ov)

        # Map obligation_id -> list of depends_on_obligation_ids
        dep_map: dict[str, list[str]] = {}
        for d in all_deps:
            dep_map.setdefault(d["obligation_id"], []).append(d["depends_on_obligation_id"])

        # Build obligation lookup by id
        obl_by_id = {o["id"]: o for o in all_obligations}

        # Compute result
        result = []
        for obl in all_obligations:
            deps = dep_map.get(obl["id"], [])
            blockers = []
            overridden_deps = []
            for dep_id in deps:
                dep_obl = obl_by_id.get(dep_id)
                if dep_obl and dep_obl["status"] != "verified":
                    edge = (obl["id"], dep_id)
                    if edge in override_set:
                        override_record = next(
                            (ov for ov in override_details.get(obl["id"], [])
                             if ov.get("overridden_dependency_id") == dep_id),
                            None,
                        )
                        # Phase 2 Step 3: This dependency was overridden.
                        # It no longer blocks, but we still surface it as "overridden"
                        # so the UI can show the override indicator.
                        overridden_deps.append({
                            **_blocker_payload(dep_obl),
                            "created_at": override_record.get("created_at") if override_record else None,
                        })
                    else:
                        blockers.append(_blocker_payload(dep_obl))

            is_blocked = len(blockers) > 0
            result.append({
                "obligation_id": obl["id"],
                "type": obl["type"],
                "title": obl["title"],
                "status": obl["status"],
                "is_blocked": is_blocked,
                "blockers": blockers,
                # Phase 2 Step 3: Include overridden dependencies in the response.
                # The UI uses this to show "Overridden dependency" indicators.
                # Overrides remove blocks, not accountability.
                "overridden_deps": overridden_deps,
                "overrides": override_details.get(obl["id"], []),
            })

        return {
            "obligations": result,
            "dependencies_created": deps_created,
        }
    except Exception as e:
        logger.error(f"Dependency evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateDependencyRequest(BaseModel):
    user_id: str
    depends_on_obligation_id: str


# Phase 2 Step 3: Override request model.
# GUARDRAILS ENCODED HERE:
# - Single dependency per request (no bulk overrides)
# - Reason is required and must be non-empty (no silent overrides)
# - No "always_allow" field. No "apply_to_all" field. One edge. One reason. One record.
class CreateOverrideRequest(BaseModel):
    user_id: str
    overridden_dependency_id: str
    user_reason: str = Field(..., min_length=1, description="Why this override is being applied. Required.")


@app.post("/api/obligations/{obligation_id}/dependencies")
async def create_obligation_dependency(obligation_id: str, request: CreateDependencyRequest):
    """
    Manually create a dependency edge between two obligations.

    This is for cases where the hardcoded map doesn't cover the relationship
    but the user knows one obligation must come before another.

    Validates:
    - Both obligations exist and belong to the same user
    - No self-reference
    - No duplicate edges
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        if obligation_id == request.depends_on_obligation_id:
            raise HTTPException(status_code=400, detail="Cannot depend on itself")

        # Verify both obligations exist and belong to the user
        obl_res = sb.table("obligations") \
            .select("id, user_id") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        dep_res = sb.table("obligations") \
            .select("id, user_id") \
            .eq("id", request.depends_on_obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        if not getattr(dep_res, "data", None):
            raise HTTPException(status_code=404, detail="Dependency obligation not found")

        # Insert edge
        insert_res = sb.table("obligation_dependencies").insert({
            "obligation_id": obligation_id,
            "depends_on_obligation_id": request.depends_on_obligation_id,
        }).execute()

        return {"status": "created", "dependency": getattr(insert_res, "data", [None])[0]}
    except HTTPException:
        raise
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Dependency already exists")
        logger.error(f"Create dependency error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PHASE 2 STEP 3: OVERRIDES (AUDITED EXCEPTIONS) ====================
#
# DISCIPLINE: Overrides are NOT shortcuts. They are audited exceptions.
#
# An override removes a SPECIFIC hard block from a SPECIFIC dependency edge.
# It does NOT:
# - Auto-suggest itself
# - Apply to other obligations
# - Reduce escalation severity
# - Silence warnings
#
# Every override is persisted as an immutable record. The system remembers.
#
# GUARDRAILS (enforced across all layers):
# 1. One dependency override per request (no bulk overrides)
# 2. User must provide a non-empty reason (no silent overrides)
# 3. The override endpoint is POST-only (no auto-creation, no GET-triggered side effects)
# 4. No "apply to all similar" option exists. Each edge is overridden individually.
# 5. AI must NEVER suggest or auto-create overrides. Human decision only.


@app.post("/api/obligations/{obligation_id}/overrides")
async def create_obligation_override(obligation_id: str, request: CreateOverrideRequest):
    """
    Create an audited override for a specific dependency block.

    This removes the hard block for ONE dependency edge.
    The override is immutable — once created, it cannot be edited or deleted.

    Validates:
    - Obligation exists and belongs to the user
    - Dependency obligation exists and belongs to the user
    - A dependency edge actually exists between them
    - Reason is non-empty
    - No duplicate overrides
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        reason = (request.user_reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Override reason is required. Overrides are not silent.")

        if obligation_id == request.overridden_dependency_id:
            raise HTTPException(status_code=400, detail="Cannot override self-dependency")

        # Verify obligation exists and belongs to user
        obl_res = sb.table("obligations") \
            .select("id, user_id, type, title") \
            .eq("id", obligation_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        # Verify dependency obligation exists and belongs to user
        dep_res = sb.table("obligations") \
            .select("id, user_id, type, title, status") \
            .eq("id", request.overridden_dependency_id) \
            .eq("user_id", request.user_id) \
            .single() \
            .execute()
        dep_obl = getattr(dep_res, "data", None)
        if not dep_obl:
            raise HTTPException(status_code=404, detail="Dependency obligation not found")

        # Verify a dependency edge actually exists (can't override a non-existent block)
        edge_res = sb.table("obligation_dependencies") \
            .select("id") \
            .eq("obligation_id", obligation_id) \
            .eq("depends_on_obligation_id", request.overridden_dependency_id) \
            .execute()
        edge_data = getattr(edge_res, "data", None) or []
        if not edge_data:
            raise HTTPException(
                status_code=400,
                detail="No dependency edge exists between these obligations. Cannot override a non-existent block."
            )

        # Verify the dependency is actually unmet (no point overriding a verified dependency)
        if dep_obl.get("status") == "verified":
            raise HTTPException(
                status_code=400,
                detail="This dependency is already verified. No override needed."
            )

        # Insert override (immutable, append-only)
        insert_res = sb.table("obligation_overrides").insert({
            "obligation_id": obligation_id,
            "overridden_dependency_id": request.overridden_dependency_id,
            "user_reason": reason,
        }).execute()

        override_data = (getattr(insert_res, "data", None) or [None])[0]

        logger.info(
            f"Override created: obligation={obligation_id}, "
            f"overridden_dep={request.overridden_dependency_id}, "
            f"reason={reason!r}"
        )

        return {
            "status": "override_created",
            "override": override_data,
            "warning": (
                "This override removes the hard block but does NOT change the dependency status. "
                "The overridden dependency is still tracked. Escalation remains active."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Override already exists for this dependency edge")
        if "append-only" in str(e).lower():
            raise HTTPException(status_code=409, detail="Override already exists (append-only)")
        logger.error(f"Create override error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/obligations/{obligation_id}/overrides")
async def get_obligation_overrides(obligation_id: str, user_id: str):
    """
    Get all overrides for a specific obligation.

    Returns the full audit trail: which dependencies were overridden, why, and when.
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Verify obligation belongs to user
        obl_res = sb.table("obligations") \
            .select("id") \
            .eq("id", obligation_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if not getattr(obl_res, "data", None):
            raise HTTPException(status_code=404, detail="Obligation not found")

        # Fetch overrides
        overrides_res = sb.table("obligation_overrides") \
            .select("*") \
            .eq("obligation_id", obligation_id) \
            .order("created_at", desc=False) \
            .execute()

        return {"overrides": overrides_res.data or []}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get overrides error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PHASE 2 STEP 4: STUCK DETECTION ====================
#
# WHAT "STUCK" MEANS:
# An obligation is STUCK when:
#   1. status = pending OR blocked
#   2. All forward paths are blocked (deps unmet, proof missing, deadline passed)
#   3. No status change has occurred in STALE_DAYS
#
# This is NOT inactivity. This is structural immobility.
#
# STUCK DETECTION IS DETERMINISTIC:
# No AI. No predictions. Just state checks and arithmetic.
#
# GUARDRAILS:
# - No auto-un-sticking. Only a real status change clears stuck.
# - No auto-overrides. Stuck detection NEVER resolves blocks.
# - No AI explanations. Only factual state descriptions.
# - No "tips" or "suggestions." Only "this is why nothing is moving."

STALE_DAYS = 5  # Conservative default. An obligation with no status change for 5+ days is stale.

# Stuck reason taxonomy. Exact list. Do NOT invent new categories.
_STUCK_REASONS = {
    "unmet_dependency",
    "overridden_dependency",
    "missing_proof",
    "external_verification_pending",
    "hard_deadline_passed",
}


# ==================== PHASE 3 STEP 1: SEVERITY ====================
#
# Deterministic severity computation. No AI. No predictions.
# Mirrors the logic in obligo-next/src/lib/severity.ts exactly.
#
# Severity is computed server-side alongside stuck detection and persisted.
# The frontend also computes severity client-side for immediate display.
# Both MUST produce the same result from the same inputs.
#
# FIVE LEVELS: normal, elevated, high, critical, failed. No others.
# DEFAULT BIAS: Understate early, overstate late.

SEVERITY_HIGH_DAYS = 3
SEVERITY_STUCK_HIGH_DAYS = 7
SEVERITY_ELEVATED_DAYS = 14

_SEVERITY_LEVELS = {"normal", "elevated", "high", "critical", "failed"}
_SEVERITY_REASONS = {
    "verified", "deadline_passed", "stuck_deadline_imminent",
    "deadline_imminent", "stuck_deadline_approaching",
    "deadline_approaching", "stuck_no_deadline_pressure", "no_pressure",
}


def _compute_severity(
    status: str,
    deadline: Optional[str],
    stuck: bool,
    now: datetime,
) -> tuple[str, str]:
    """
    Compute (severity_level, severity_reason) for an obligation.

    Pure function. No side effects. No network calls.
    Rules match severity.ts exactly.
    """
    # Rule 1: Verified = done
    if status == "verified":
        return ("normal", "verified")
    # Rule 1b: Failed is terminal
    if status == "failed":
        return ("failed", "deadline_passed")

    # Time computation
    if deadline:
        try:
            deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, AttributeError):
            deadline_dt = None

        if deadline_dt:
            days_remaining = (deadline_dt - now).total_seconds() / (60 * 60 * 24)

            # Rule 2: Deadline passed → Failed
            if days_remaining < 0:
                return ("failed", "deadline_passed")

            # Rule 3: Deadline <= 3 days AND stuck → Critical
            if days_remaining <= SEVERITY_HIGH_DAYS and stuck:
                return ("critical", "stuck_deadline_imminent")

            # Rule 4: Deadline <= 3 days → High
            if days_remaining <= SEVERITY_HIGH_DAYS:
                return ("high", "deadline_imminent")

            # Rule 5: Stuck AND deadline <= 7 days → High
            if stuck and days_remaining <= SEVERITY_STUCK_HIGH_DAYS:
                return ("high", "stuck_deadline_approaching")

            # Rule 6: Deadline <= 14 days → Elevated
            if days_remaining <= SEVERITY_ELEVATED_DAYS:
                return ("elevated", "deadline_approaching")

    # Rule 7: Stuck with no deadline pressure → Elevated
    if stuck:
        return ("elevated", "stuck_no_deadline_pressure")

    # Rule 8: Everything else → Normal
    return ("normal", "no_pressure")


def _find_deadlocked_obligations(
    dep_edges: list[tuple[str, str]],
    override_set: set[tuple[str, str]],
) -> set[str]:
    """
    Find obligation IDs that are part of or downstream of dependency cycles.

    A cycle (A → B → A) means neither A nor B can ever be verified.
    An obligation downstream of a cycle (C → A where A is in a cycle) is also deadlocked.

    Overridden edges are excluded — an override breaks the cycle from that direction.

    Uses DFS with recursion stack to detect back edges.
    """
    # Build graph excluding overridden edges
    graph: dict[str, set[str]] = {}
    all_nodes: set[str] = set()
    for obl_id, dep_id in dep_edges:
        if (obl_id, dep_id) in override_set:
            continue
        graph.setdefault(obl_id, set()).add(dep_id)
        all_nodes.add(obl_id)
        all_nodes.add(dep_id)

    deadlocked: set[str] = set()
    visited: set[str] = set()
    in_stack: set[str] = set()

    def dfs(node: str) -> bool:
        """Returns True if node reaches a cycle."""
        visited.add(node)
        in_stack.add(node)
        reaches_cycle = False
        for dep in graph.get(node, set()):
            if dep in in_stack:
                # Back edge → cycle detected
                deadlocked.add(dep)
                deadlocked.add(node)
                reaches_cycle = True
            elif dep not in visited:
                if dfs(dep):
                    deadlocked.add(node)
                    reaches_cycle = True
            elif dep in deadlocked:
                deadlocked.add(node)
                reaches_cycle = True
        in_stack.discard(node)
        return reaches_cycle

    for node in all_nodes:
        if node not in visited:
            dfs(node)

    return deadlocked


def _trace_dependency_chain(
    obl_id: str,
    dep_graph: dict[str, list[str]],
    override_set: set[tuple[str, str]],
    obl_by_id: dict[str, dict],
    max_depth: int = 10,
) -> list[dict]:
    """
    Trace the dependency chain from an obligation to its root blocker.

    Follows the first unmet (non-overridden) dependency at each level.
    Returns a list of chain links with type, title, status, and cycle detection.
    """
    chain: list[dict] = []
    current = obl_id
    seen: set[str] = set()

    while current and current not in seen and len(chain) < max_depth:
        seen.add(current)
        deps = dep_graph.get(current, [])
        unmet = None
        for dep_id in deps:
            if (current, dep_id) in override_set:
                continue
            dep_obl = obl_by_id.get(dep_id)
            if dep_obl and dep_obl["status"] != "verified":
                unmet = dep_id
                break

        if unmet:
            dep_obl = obl_by_id[unmet]
            is_cycle = unmet in seen
            chain.append({
                "obligation_id": unmet,
                "type": dep_obl["type"],
                "title": dep_obl["title"],
                "status": dep_obl["status"],
                "is_cycle_back": is_cycle,
            })
            if is_cycle:
                break
            current = unmet
        else:
            break

    return chain


@app.get("/api/obligations/stuck-detection")
async def detect_stuck_obligations(user_id: str):
    """
    Evaluate stuck state for all obligations belonging to a user.

    For each obligation:
    1. Check if status is pending/blocked (precondition for stuck)
    2. Check if stale (no status change in STALE_DAYS)
    3. Classify the dominant blocking reason
    4. Detect dependency deadlocks (cycles)
    5. Trace the dependency chain
    6. Persist stuck state to the database
    7. Return results

    This endpoint is DETERMINISTIC. No AI. No suggestions.
    It tells the user "nothing is happening, and this is why."
    """
    try:
        from backend.email_monitor import _get_supabase
        sb = _get_supabase()

        # Fetch all obligations for this user
        obl_res = sb.table("obligations") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        all_obligations = obl_res.data or []

        if not all_obligations:
            return {"obligations": [], "deadlocks_detected": 0}

        obl_ids = [o["id"] for o in all_obligations]
        obl_by_id = {o["id"]: o for o in all_obligations}

        # Fetch all dependency edges
        deps_res = sb.table("obligation_dependencies") \
            .select("obligation_id, depends_on_obligation_id") \
            .in_("obligation_id", obl_ids) \
            .execute()
        dep_edges = [
            (d["obligation_id"], d["depends_on_obligation_id"])
            for d in (deps_res.data or [])
        ]

        # Build dependency graph: obligation_id -> [dependency_ids]
        dep_graph: dict[str, list[str]] = {}
        for obl_id, dep_id in dep_edges:
            dep_graph.setdefault(obl_id, []).append(dep_id)

        # Fetch all overrides
        overrides_res = sb.table("obligation_overrides") \
            .select("obligation_id, overridden_dependency_id") \
            .in_("obligation_id", obl_ids) \
            .execute()
        override_set: set[tuple[str, str]] = {
            (o["obligation_id"], o["overridden_dependency_id"])
            for o in (overrides_res.data or [])
        }

        # Fetch proof counts per obligation (for missing_proof detection)
        proofs_res = sb.table("obligation_proofs") \
            .select("obligation_id") \
            .in_("obligation_id", obl_ids) \
            .execute()
        proof_obl_ids: set[str] = {p["obligation_id"] for p in (proofs_res.data or [])}

        # Detect deadlocked obligations (cycles in dependency graph)
        deadlocked_ids = _find_deadlocked_obligations(dep_edges, override_set)

        now = datetime.utcnow()
        results = []
        updates_to_persist: list[dict] = []

        for obl in all_obligations:
            obl_id = obl["id"]
            status = obl["status"]

            # Precondition: only pending/blocked can be stuck
            if status in ("verified", "submitted"):
                # submitted is handled separately as external_verification_pending
                if status == "submitted":
                    # Check stale for submitted obligations
                    status_changed = obl.get("status_changed_at") or obl.get("updated_at") or obl["created_at"]
                    try:
                        changed_dt = datetime.fromisoformat(status_changed.replace("Z", "+00:00")).replace(tzinfo=None)
                    except (ValueError, AttributeError):
                        changed_dt = now
                    days_since = (now - changed_dt).days

                    if days_since >= STALE_DAYS:
                        stuck_reason = "external_verification_pending"
                        stuck_since = obl.get("stuck_since")
                        if not obl.get("stuck"):
                            stuck_since = now.isoformat()

                        chain = _trace_dependency_chain(obl_id, dep_graph, override_set, obl_by_id)

                        # Phase 3 Step 1: Compute severity
                        sev_level, sev_reason = _compute_severity(status, obl.get("deadline"), True, now)
                        sev_since = obl.get("severity_since")
                        if obl.get("severity") != sev_level:
                            sev_since = now.isoformat()

                        results.append({
                            "obligation_id": obl_id,
                            "type": obl["type"],
                            "title": obl["title"],
                            "status": status,
                            "stuck": True,
                            "stuck_reason": stuck_reason,
                            "stuck_since": stuck_since,
                            "is_deadlocked": obl_id in deadlocked_ids,
                            "chain": chain,
                            "days_stale": days_since,
                            "severity": sev_level,
                            "severity_reason": sev_reason,
                            "severity_since": sev_since,
                        })
                        updates_to_persist.append({
                            "id": obl_id,
                            "stuck": True,
                            "stuck_reason": stuck_reason,
                            "stuck_since": stuck_since,
                            "severity": sev_level,
                            "severity_reason": sev_reason,
                            "severity_since": sev_since,
                        })
                    else:
                        # Phase 3 Step 1: Compute severity (not stuck)
                        sev_level, sev_reason = _compute_severity(status, obl.get("deadline"), False, now)
                        sev_since = obl.get("severity_since")
                        if obl.get("severity") != sev_level:
                            sev_since = now.isoformat()

                        # Not stale yet — clear stuck if previously set, always persist severity
                        needs_update = obl.get("stuck") or obl.get("severity") != sev_level
                        if needs_update:
                            updates_to_persist.append({
                                "id": obl_id,
                                "stuck": False,
                                "stuck_reason": None,
                                "stuck_since": None,
                                "severity": sev_level,
                                "severity_reason": sev_reason,
                                "severity_since": sev_since,
                            })
                        results.append({
                            "obligation_id": obl_id,
                            "type": obl["type"],
                            "title": obl["title"],
                            "status": status,
                            "stuck": False,
                            "stuck_reason": None,
                            "stuck_since": None,
                            "is_deadlocked": False,
                            "chain": [],
                            "days_stale": days_since,
                            "severity": sev_level,
                            "severity_reason": sev_reason,
                            "severity_since": sev_since,
                        })
                    continue

                # verified — never stuck, severity = normal
                sev_level, sev_reason = "normal", "verified"
                sev_since = obl.get("severity_since")
                if obl.get("severity") != sev_level:
                    sev_since = now.isoformat()

                needs_update = obl.get("stuck") or obl.get("severity") != sev_level
                if needs_update:
                    updates_to_persist.append({
                        "id": obl_id,
                        "stuck": False,
                        "stuck_reason": None,
                        "stuck_since": None,
                        "severity": sev_level,
                        "severity_reason": sev_reason,
                        "severity_since": sev_since,
                    })
                results.append({
                    "obligation_id": obl_id,
                    "type": obl["type"],
                    "title": obl["title"],
                    "status": status,
                    "stuck": False,
                    "stuck_reason": None,
                    "stuck_since": None,
                    "is_deadlocked": False,
                    "chain": [],
                    "days_stale": 0,
                    "severity": sev_level,
                    "severity_reason": sev_reason,
                    "severity_since": sev_since,
                })
                continue

            # status is pending or blocked
            status_changed = obl.get("status_changed_at") or obl.get("updated_at") or obl["created_at"]
            try:
                changed_dt = datetime.fromisoformat(status_changed.replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, AttributeError):
                changed_dt = now
            days_since = (now - changed_dt).days

            # Classify dominant blocking reason (priority order)
            is_deadlock = obl_id in deadlocked_ids
            has_unmet_deps = False
            has_overridden_deps_only = False
            needs_proof = obl.get("proof_required", False) and obl_id not in proof_obl_ids
            deadline_passed = False

            if obl.get("deadline"):
                try:
                    deadline_dt = datetime.fromisoformat(
                        obl["deadline"].replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                    deadline_passed = deadline_dt < now
                except (ValueError, AttributeError):
                    pass

            # Check dependencies
            deps = dep_graph.get(obl_id, [])
            unmet_count = 0
            overridden_count = 0
            for dep_id in deps:
                dep_obl = obl_by_id.get(dep_id)
                if dep_obl and dep_obl["status"] != "verified":
                    if (obl_id, dep_id) in override_set:
                        overridden_count += 1
                    else:
                        unmet_count += 1

            has_unmet_deps = unmet_count > 0
            has_overridden_deps_only = overridden_count > 0 and unmet_count == 0

            # Determine dominant reason (priority: deadlock > deadline > unmet_dep > missing_proof > overridden)
            stuck_reason: Optional[str] = None
            is_structurally_blocked = False

            if is_deadlock:
                stuck_reason = "unmet_dependency"
                is_structurally_blocked = True
            elif deadline_passed:
                stuck_reason = "hard_deadline_passed"
                is_structurally_blocked = True
            elif has_unmet_deps:
                stuck_reason = "unmet_dependency"
                is_structurally_blocked = True
            elif needs_proof:
                stuck_reason = "missing_proof"
                is_structurally_blocked = True
            elif has_overridden_deps_only:
                stuck_reason = "overridden_dependency"
                is_structurally_blocked = True

            # Stuck requires: structurally blocked AND stale
            is_stuck = is_structurally_blocked and days_since >= STALE_DAYS

            # Trace the dependency chain for context
            chain = _trace_dependency_chain(obl_id, dep_graph, override_set, obl_by_id)

            stuck_since = None
            if is_stuck:
                stuck_since = obl.get("stuck_since")
                if not obl.get("stuck"):
                    # First time detected as stuck — record now
                    stuck_since = now.isoformat()

            # Phase 3 Step 1: Compute severity
            sev_level, sev_reason = _compute_severity(status, obl.get("deadline"), is_stuck, now)
            sev_since = obl.get("severity_since")
            if obl.get("severity") != sev_level:
                sev_since = now.isoformat()
            should_mark_failed = sev_level == "failed" and status not in ("failed", "verified")

            results.append({
                "obligation_id": obl_id,
                "type": obl["type"],
                "title": obl["title"],
                "status": status,
                "stuck": is_stuck,
                "stuck_reason": stuck_reason if is_stuck else None,
                "stuck_since": stuck_since,
                "is_deadlocked": is_deadlock,
                "chain": chain,
                "days_stale": days_since,
                "severity": sev_level,
                "severity_reason": sev_reason,
                "severity_since": sev_since,
            })

            # Persist stuck state + severity
            if is_stuck:
                updates_to_persist.append({
                    "id": obl_id,
                    "stuck": True,
                    "stuck_reason": stuck_reason,
                    "stuck_since": stuck_since,
                    "severity": sev_level,
                    "severity_reason": sev_reason,
                    "severity_since": sev_since,
                    "status": "failed" if should_mark_failed else None,
                })
            elif obl.get("stuck") or obl.get("severity") != sev_level:
                # Stuck changed or severity changed — persist
                updates_to_persist.append({
                    "id": obl_id,
                    "stuck": False,
                    "stuck_reason": None,
                    "stuck_since": None,
                    "severity": sev_level,
                    "severity_reason": sev_reason,
                    "severity_since": sev_since,
                    "status": "failed" if should_mark_failed else None,
                })

        # Batch persist stuck state + severity updates
        for update in updates_to_persist:
            try:
                update_payload = {
                    "stuck": update["stuck"],
                    "stuck_reason": update["stuck_reason"],
                    "stuck_since": update["stuck_since"],
                }
                # Phase 3 Step 1: Include severity fields if present
                if "severity" in update:
                    update_payload["severity"] = update["severity"]
                    update_payload["severity_reason"] = update["severity_reason"]
                    update_payload["severity_since"] = update["severity_since"]
                if update.get("status") == "failed":
                    update_payload["status"] = "failed"
                sb.table("obligations") \
                    .update(update_payload) \
                    .eq("id", update["id"]) \
                    .execute()
            except Exception as e:
                logger.warning(f"Failed to persist stuck/severity state for {update['id']}: {e}")

        stuck_count = sum(1 for r in results if r["stuck"])
        deadlock_count = sum(1 for r in results if r["is_deadlocked"])

        # Phase 3 Step 1: Severity summary counts
        severity_counts = {}
        for r in results:
            sev = r.get("severity", "normal")
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        return {
            "obligations": results,
            "stuck_count": stuck_count,
            "deadlocks_detected": deadlock_count,
            "stale_threshold_days": STALE_DAYS,
            "severity_counts": severity_counts,
        }
    except Exception as e:
        logger.error(f"Stuck detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== BACKGROUND JOBS (OPTIONAL) ====================

def _scan_all_connected_users():
    """
    Optional background email scan loop.

    Enable by setting EMAIL_SCAN_INTERVAL_MINUTES > 0 in the environment.
    This keeps MVP simple (single service) while still supporting "email found within ~15 min".
    """
    try:
        from backend.email_monitor import EmailMonitor

        monitor = EmailMonitor()
        connections = (
            monitor.supabase.table("email_connections")
            .select("user_id, access_token, refresh_token")
            .eq("is_active", True)
            .execute()
        )
        rows = connections.data or []
        if not rows:
            return

        for conn in rows:
            user_id = conn.get("user_id")
            access_token = conn.get("access_token")
            refresh_token = conn.get("refresh_token")
            if not user_id or not access_token:
                continue

            try:
                schools_result = (
                    monitor.supabase.table("schools")
                    .select("name")
                    .eq("user_id", user_id)
                    .execute()
                )
                school_names = [s.get("name") for s in (schools_result.data or []) if s.get("name")]

                monitor.scan_user_emails(
                    user_id=user_id,
                    access_token=access_token,
                    refresh_token=refresh_token,
                    school_names=school_names,
                    max_results=30,
                )
            except Exception as e:
                logger.error("Scheduled scan failed for user %s: %s", user_id, e)
    except Exception as e:
        logger.error("Scheduled scan loop error: %s", e)


@app.on_event("startup")
def _startup_jobs():
    interval = int(os.getenv("EMAIL_SCAN_INTERVAL_MINUTES", "0") or "0")
    if interval <= 0:
        return
    try:
        scheduler.add_job(
            _scan_all_connected_users,
            "interval",
            minutes=interval,
            id="email_scan_all",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info("Background email scan enabled: every %s minutes", interval)
    except Exception as e:
        logger.error("Failed to start background jobs: %s", e)


@app.on_event("shutdown")
def _shutdown_jobs():
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass


# ==================== STARTUP ====================

if __name__ == "__main__":
    logger.info("Starting Obligo API server...")
    logger.info("Daily Coach Loop endpoints:")
    logger.info("  POST /api/coach/check-in       - Submit morning check-in")
    logger.info("  GET  /api/coach/today           - Get today's state")
    logger.info("  POST /api/coach/evening-signal  - Submit evening signal")
    logger.info("Email Monitoring endpoints:")
    logger.info("  POST /api/email/connect         - Store Gmail OAuth tokens")
    logger.info("  POST /api/email/scan            - Trigger email scan")
    logger.info("  GET  /api/email/history          - Get analyzed emails")
    logger.info("  POST /api/email/dismiss          - Dismiss an email")
    logger.info("  GET  /api/email/connection       - Check connection status")
    logger.info("Email Drafting endpoints:")
    logger.info("  POST /api/draft/create           - Generate AI email draft")
    logger.info("  POST /api/draft/improve          - Improve draft with feedback")
    logger.info("  POST /api/draft/send             - Approve & send draft")
    logger.info("  POST /api/draft/cancel           - Cancel a draft")
    logger.info("  GET  /api/draft/pending          - Get pending approvals")
    logger.info("  GET  /api/draft/history          - Get all drafts")
    logger.info("Proof-Missing Recovery (Phase 1 Step 4):")
    logger.info("  GET  /api/obligations/proof-missing          - Detect unverified obligations")
    logger.info("  POST /api/obligations/generate-recovery-drafts - Generate follow-up drafts")
    logger.info("  GET  /api/obligations/dependencies            - Evaluate dependency graph")
    logger.info("  POST /api/obligations/{id}/dependencies       - Create dependency edge")
    logger.info("Dependency Overrides (Phase 2 Step 3):")
    logger.info("  POST /api/obligations/{id}/overrides          - Create audited override")
    logger.info("  GET  /api/obligations/{id}/overrides          - Get override audit trail")
    logger.info("Stuck Detection (Phase 2 Step 4):")
    logger.info("  GET  /api/obligations/stuck-detection          - Detect stuck obligations & deadlocks")

    uvicorn.run(app, host="0.0.0.0", port=8000)
    
