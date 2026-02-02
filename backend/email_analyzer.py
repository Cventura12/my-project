"""
Email Analyzer — Claude-powered email analysis for financial aid relevance.

Analyzes raw email text and determines:
- Whether it requires action
- Relevance to financial aid (high/medium/low/none)
- Category (financial_aid, deadline, document_request, status_update, general)
- Action needed, deadline, school match
"""

import json
import logging
import os
from typing import Dict, Any, Optional

from anthropic import Anthropic

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """You are an AI assistant that analyzes emails for a college student tracking financial aid.

Analyze this email and determine:
1. Is it relevant to financial aid, college applications, or academic deadlines?
2. Does it require action from the student?
3. What category does it fall into?

Email Subject: {subject}
From: {sender}
Date: {date}

Email Body:
{body}

Student's schools (if known): {schools}

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{{
  "requires_action": true/false,
  "relevance": "high" | "medium" | "low" | "none",
  "category": "financial_aid" | "deadline" | "document_request" | "status_update" | "general" | null,
  "summary": "one-sentence description of what this email is about",
  "action_needed": "specific action the student should take, or null if none",
  "deadline": "YYYY-MM-DD if a deadline is mentioned, otherwise null",
  "deadline_implied": true/false,
  "school_match": "name of matching school if detected, otherwise null"
}}

Rules:
- "high" relevance: directly about financial aid, FAFSA, scholarships, tuition, aid packages
- "medium" relevance: academic deadlines, enrollment, registration, transcripts
- "low" relevance: general college communications, newsletters
- "none" relevance: spam, promotions, unrelated emails
- Only set requires_action to true if the student personally needs to do something
- Be concise and factual in the summary
- If multiple schools are listed, try to match against the sender or content"""


def analyze_email(
    subject: str,
    sender: str,
    date: str,
    body: str,
    schools: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Analyze a single email for financial aid relevance using Claude.

    Returns a dict with: requires_action, relevance, category, summary,
    action_needed, deadline, deadline_implied, school_match
    """
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        return _fallback_analysis(subject, sender)

    client = Anthropic(api_key=api_key)
    schools_str = ", ".join(schools) if schools else "Unknown"

    prompt = ANALYSIS_PROMPT.format(
        subject=subject or "(no subject)",
        sender=sender or "Unknown",
        date=date or "Unknown",
        body=(body or "")[:3000],  # Limit body to 3000 chars
        schools=schools_str,
    )

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text.strip()
        # Strip markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1]
            if response_text.endswith("```"):
                response_text = response_text[:-3].strip()

        analysis = json.loads(response_text)
        return _normalize(analysis)

    except json.JSONDecodeError as e:
        logger.error(f"Claude returned invalid JSON: {e}")
        return _fallback_analysis(subject, sender)
    except Exception as e:
        logger.error(f"Error analyzing email with Claude: {e}")
        return _fallback_analysis(subject, sender)


def _normalize(analysis: Dict) -> Dict[str, Any]:
    """Normalize analysis output with safe defaults."""
    return {
        "requires_action": analysis.get("requires_action", False),
        "relevance": analysis.get("relevance", "low"),
        "category": analysis.get("category"),
        "summary": analysis.get("summary", "No summary available"),
        "action_needed": analysis.get("action_needed"),
        "deadline": analysis.get("deadline"),
        "deadline_implied": analysis.get("deadline_implied", False),
        "school_match": analysis.get("school_match"),
    }


def _fallback_analysis(subject: str, sender: str) -> Dict[str, Any]:
    """Return a safe fallback when AI analysis fails."""
    return {
        "requires_action": False,
        "relevance": "low",
        "category": "general",
        "summary": f"Email from {sender}: {subject}" if subject else "Unable to analyze",
        "action_needed": None,
        "deadline": None,
        "deadline_implied": False,
        "school_match": None,
    }
