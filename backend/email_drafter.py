"""
Email Drafter — Claude-powered email drafting for financial aid follow-ups.

Generates professional emails for:
- Document follow-ups (overdue/missing docs)
- Status inquiries (general, timeline, missing documents)
- Draft improvement based on user feedback
"""

import json
import logging
import os
from typing import Dict, Optional

from anthropic import Anthropic

logger = logging.getLogger(__name__)


def _get_client() -> Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")
    return Anthropic(api_key=api_key)


def draft_follow_up_email(
    school_name: str,
    document_name: str,
    deadline: Optional[str] = None,
    context: Optional[str] = None,
    student_name: str = "Student",
) -> Dict[str, str]:
    """
    Draft a professional follow-up email about a specific document.

    Returns: {"subject": str, "body": str}
    """
    deadline_text = f" The deadline was {deadline}." if deadline else ""
    context_text = f"\n\nAdditional context: {context}" if context else ""

    prompt = f"""Draft a professional, polite follow-up email to a university financial aid office.

Details:
- School: {school_name}
- Student: {student_name}
- Document: {document_name}
- Status: Not yet received/processed{deadline_text}{context_text}

Write a concise email (3-4 sentences) that:
1. Politely inquires about the status of the document
2. Mentions any relevant deadline
3. Asks if they need anything else from the student
4. Maintains professional but friendly tone

Return ONLY valid JSON (no markdown, no extra text):
{{
  "subject": "a clear subject line",
  "body": "the email body text"
}}"""

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "subject": f"Following up on {document_name} — {school_name}",
            "body": text,
        }


def draft_status_inquiry_email(
    school_name: str,
    student_name: str,
    student_email: str,
    inquiry_type: str = "general",
) -> Dict[str, str]:
    """
    Draft a general status inquiry email.

    inquiry_type: "general" | "timeline" | "missing_documents"
    Returns: {"subject": str, "body": str}
    """
    inquiry_prompts = {
        "general": "asking for a general update on financial aid application status",
        "timeline": "asking about the timeline for financial aid decisions",
        "missing_documents": "asking if any documents are missing from the application",
    }

    prompt = f"""Draft a professional email to a university financial aid office.

Student: {student_name} ({student_email})
School: {school_name}
Purpose: {inquiry_prompts.get(inquiry_type, "inquiring about financial aid status")}

Write:
1. A clear, concise subject line
2. A professional email body (4-5 sentences) that introduces the student, states the purpose, and thanks them.

Return ONLY valid JSON:
{{
  "subject": "subject line",
  "body": "email body"
}}"""

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "subject": f"Financial Aid Inquiry — {school_name}",
            "body": text,
        }


def improve_draft(original_draft: str, user_feedback: str) -> str:
    """
    Improve an email draft based on user feedback.

    Returns: improved email body text.
    """
    prompt = f"""Improve this email draft based on the user's feedback.

Original Draft:
{original_draft}

User Feedback:
{user_feedback}

Return ONLY the improved email body, no extra commentary."""

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text.strip()
