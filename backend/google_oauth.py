"""
Helpers for Google OAuth client credentials used by Gmail scanning/sending.

Deployment-friendly: supports loading credentials from environment variables
instead of requiring a local `credentials.json` file.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Tuple

logger = logging.getLogger(__name__)


def get_gmail_redirect_uri() -> str:
    # Must match a redirect URI configured in Google Cloud Console for the OAuth client.
    backend_public_url = os.environ.get("BACKEND_PUBLIC_URL", "http://localhost:8000").rstrip("/")
    return f"{backend_public_url}/oauth/gmail/callback"


def load_gmail_oauth_credentials() -> Tuple[str, str]:
    """
    Return (client_id, client_secret) for the Google OAuth client.

    Lookup order:
    1) GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET
    2) GMAIL_CREDENTIALS_JSON (raw JSON or base64-encoded JSON)
    3) File path from GMAIL_CREDENTIALS_PATH, else ./credentials.json
    """
    env_client_id = os.getenv("GMAIL_CLIENT_ID")
    env_client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    if env_client_id and env_client_secret:
        return env_client_id, env_client_secret

    creds_json = os.getenv("GMAIL_CREDENTIALS_JSON")
    if creds_json:
        data = _parse_credentials_json(creds_json)
        return _extract_client_id_secret(data)

    path = os.getenv("GMAIL_CREDENTIALS_PATH", "credentials.json")
    if Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return _extract_client_id_secret(data)

    raise ValueError(
        "Missing Gmail OAuth client credentials. Set GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET "
        "or GMAIL_CREDENTIALS_JSON or provide a credentials.json via GMAIL_CREDENTIALS_PATH."
    )


def _parse_credentials_json(value: str) -> Dict[str, Any]:
    """Parse raw JSON or base64 JSON from an env var."""
    raw = value.strip()
    if raw.startswith("{"):
        return json.loads(raw)

    # Try base64 / base64url (with optional padding)
    try:
        padded = raw + "=" * (-len(raw) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8"))
        return json.loads(decoded.decode("utf-8"))
    except Exception as e:  # pragma: no cover
        logger.error("Failed to parse GMAIL_CREDENTIALS_JSON: %s", e)
        raise


def _extract_client_id_secret(data: Dict[str, Any]) -> Tuple[str, str]:
    """Support both Google 'web'/'installed' credentials and flat env-like JSON."""
    if "web" in data:
        client = data["web"]
    elif "installed" in data:
        client = data["installed"]
    else:
        client = data

    client_id = client.get("client_id")
    client_secret = client.get("client_secret")
    if not client_id or not client_secret:
        raise ValueError("Invalid Gmail OAuth credentials: missing client_id/client_secret")
    return client_id, client_secret
