# pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client fastapi uvicorn anthropic python-dotenv APScheduler

import os
import json
import base64
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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

load_dotenv()

app = FastAPI()

# Helper function to safely print Unicode strings on Windows
def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        # Remove non-ASCII characters if printing fails
        print(text.encode('ascii', 'ignore').decode('ascii'))

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
action_log = []
scheduler = BackgroundScheduler()

class EmailRequest(BaseModel):
    email_text: str

class ObligationResponse(BaseModel):
    requires_action: bool
    summary: str = None
    action: str = None
    deadline: str = None
    deadline_implied: bool = None
    stakes: str = None
    authority: str = None
    blocking: bool = None

class MicroActionRequest(BaseModel):
    obligation_id: str
    action: str
    approval: str

def get_gmail_service():
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
    for header in headers:
        if header['name'].lower() == name.lower():
            return header['value']
    return ""

def fetch_gmail_emails(max_results=50):
    try:
        service = get_gmail_service()
        results = service.users().messages().list(userId='me', maxResults=max_results).execute()
        messages = results.get('messages', [])

        if not messages:
            print("No emails found in Gmail inbox.")
            return []

        emails = []
        for msg in messages:
            message = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
            headers = message['payload']['headers']

            subject = get_header(headers, 'Subject')
            sender = get_header(headers, 'From')
            date = get_header(headers, 'Date')
            body = extract_email_body(message['payload'])

            emails.append({
                'id': msg['id'],
                'subject': subject,
                'sender': sender,
                'date': date,
                'body': body,
                'full_text': f"Subject: {subject}\nFrom: {sender}\nDate: {date}\n\n{body}"
            })

        return emails
    except Exception as e:
        print(f"Error fetching Gmail emails: {str(e)}")
        raise

def analyze_email_with_claude(email_text):
    client = Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

    prompt = f"""You are an AI that reads an email and extracts the actionable obligations for a user.

Your goal is to detect if the email requires the user to do something, and if so, extract structured details.

RULES:
1. If there is **no actionable obligation**, return JSON: {{"requires_action": false}}.
2. If there **is** an obligation, return JSON like this:

{{
  "requires_action": true,
  "summary": "Brief one-line description of what the email is about",
  "action": "The concrete next step the user should take",
  "deadline": "YYYY-MM-DD or null if not specified",
  "deadline_implied": true/false,
  "stakes": "Describe what happens if ignored",
  "authority": "Who sent it or who requested the action",
  "blocking": true/false
}}

ADDITIONAL RULES:
- Be concise in summary and action (max 1-2 sentences).
- Extract **implicit deadlines** if the email implies a due date.
- Extract **stakes** (why ignoring this matters).
- Extract **authority** (professor, manager, client, admin).
- Only output JSON. No explanation or extra text.

EMAIL:
\"\"\"
{email_text}
\"\"\"
"""

    message = client.messages.create(
        model="claude-2.1",
        max_tokens=1024,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    response_text = message.content[0].text.strip()
    return json.loads(response_text)

def generate_micro_action_and_motivation(obligation):
    client = Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

    prompt = f"""You are an AI assistant helping users complete their obligations efficiently.

Given this obligation:
Summary: {obligation['summary']}
Action: {obligation['action']}
Stakes: {obligation['stakes']}
Deadline: {obligation.get('deadline', 'No deadline')}
Authority: {obligation.get('authority', 'Unknown')}

Generate a structured response in JSON format:

{{
  "micro_action": "A single, concrete, actionable step (1-2 sentences, max 20 words). Be specific and practical.",
  "motivation": "Why this matters and encouragement to act (1 sentence, max 15 words).",
  "prepared_content": "If applicable, draft email reply, form text, or checklist. Otherwise: null",
  "action_type": "email_draft|form_fill|checklist|research|none",
  "requires_approval": true/false,
  "safety_flags": {{
    "financial_transaction": false,
    "legal_submission": false,
    "irreversible": false
  }}
}}

IMPORTANT:
- Keep micro_action specific and immediately actionable
- Keep motivation brief and encouraging
- If action_type is "email_draft", generate a professional email template in prepared_content
- If action_type is "form_fill", list the information needed in prepared_content
- If action_type is "checklist", provide a step-by-step list in prepared_content
- Set requires_approval to true if any action involves external communication or submissions
- Flag any safety concerns appropriately

Only output JSON. No explanation or extra text."""

    message = client.messages.create(
        model="claude-2.1",
        max_tokens=1024,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    response_text = message.content[0].text.strip()
    return json.loads(response_text)

def calculate_deadline_score(deadline_str):
    if not deadline_str or deadline_str == "null":
        return 5

    try:
        deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
        today = datetime.now()
        days_until = (deadline - today).days

        if days_until < 0:
            return 15
        elif days_until == 0:
            return 12
        elif days_until <= 1:
            return 10
        elif days_until <= 3:
            return 8
        elif days_until <= 7:
            return 6
        elif days_until <= 14:
            return 4
        else:
            return 2
    except:
        return 5

def calculate_authority_score(authority_str):
    if not authority_str:
        return 3

    authority_lower = authority_str.lower()

    if any(word in authority_lower for word in ['professor', 'prof', 'dr.', 'dean']):
        return 10
    elif any(word in authority_lower for word in ['manager', 'supervisor', 'boss', 'ceo', 'director']):
        return 10
    elif any(word in authority_lower for word in ['admin', 'administration', 'registrar', 'financial aid']):
        return 9
    elif any(word in authority_lower for word in ['client', 'customer']):
        return 8
    elif any(word in authority_lower for word in ['team', 'colleague', 'coworker']):
        return 5
    else:
        return 3

def calculate_stakes_score(stakes_str):
    if not stakes_str:
        return 3

    stakes_lower = stakes_str.lower()

    high_impact = ['lose', 'fail', 'miss', 'ineligible', 'penalty', 'fired', 'expelled', 'rejected']
    medium_impact = ['delay', 'postpone', 'late', 'behind', 'slow']

    if any(word in stakes_lower for word in high_impact):
        return 10
    elif any(word in stakes_lower for word in medium_impact):
        return 6
    else:
        return 3

def calculate_obligation_score(obligation):
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

def log_action(obligation_id, action_type, content, approval_status, user_input=None):
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'obligation_id': obligation_id,
        'action_type': action_type,
        'content': content,
        'approval_status': approval_status,
        'user_input': user_input
    }
    action_log.append(log_entry)

    with open('action_log.json', 'w') as f:
        json.dump(action_log, f, indent=2)

    return log_entry

def execute_micro_action(obligation_id, micro_action_data, user_approval):
    if not user_approval or user_approval.lower() != 'approve':
        log_action(obligation_id, micro_action_data['action_type'], micro_action_data, 'rejected', user_approval)
        return {'status': 'rejected', 'message': 'Action not approved by user'}

    safety_flags = micro_action_data['safety_flags']
    if safety_flags['financial_transaction'] or safety_flags['legal_submission'] or safety_flags['irreversible']:
        log_action(obligation_id, micro_action_data['action_type'], micro_action_data, 'blocked_safety', user_approval)
        return {'status': 'blocked', 'message': 'Action blocked due to safety flags'}

    action_type = micro_action_data['action_type']
    prepared_content = micro_action_data.get('prepared_content')

    print("\n" + "="*80)
    print(" EXECUTING MICRO-ACTION (SIMULATION)")
    print("="*80)
    print(f"Action Type: {action_type}")
    safe_print(f"Micro-Action: {micro_action_data['micro_action']}")
    safe_print(f"Motivation: {micro_action_data['motivation']}")

    if prepared_content:
        print("\n--- PREPARED CONTENT ---")
        print(prepared_content)
        print("--- END PREPARED CONTENT ---")

    print("\n[MVP SIMULATION: In production, this would execute the actual action]")
    print("="*80 + "\n")

    log_action(obligation_id, action_type, micro_action_data, 'approved_executed', user_approval)

    return {
        'status': 'executed',
        'message': 'Micro-action executed successfully (simulated)',
        'action_type': action_type,
        'content': prepared_content
    }

def run_daily_obligation_check():
    print("\n" + "="*80)
    print("SCHEDULED DAILY OBLIGATION CHECK")
    print("="*80)
    print(f" {datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')}\n")

    try:
        print("Fetching emails from Gmail...")
        emails = fetch_gmail_emails(max_results=50)
        print(f"OK Successfully fetched {len(emails)} emails from inbox\n")

        print("Analyzing emails for actionable obligations...")
        print("-"*80)

        obligations = []

        for idx, email in enumerate(emails, 1):
            print(f"[{idx}/{len(emails)}] Analyzing: {email['subject'][:60]}...")

            try:
                analysis = analyze_email_with_claude(email['full_text'])

                if analysis.get('requires_action'):
                    obligations.append(analysis)
                    safe_print(f"    OK Obligation detected: {analysis['summary']}")
                else:
                    print(f"    INFO:  No action required")

            except Exception as e:
                print(f"     Error analyzing email: {str(e)}")

        print("\n" + "="*80)
        print(f" ANALYSIS COMPLETE")
        print(f"   Total Emails: {len(emails)}")
        print(f"   Actionable Obligations: {len(obligations)}")
        print("="*80)

        if not obligations:
            print("\n No actionable obligations found. You're all clear!\n")
            log_daily_summary(len(emails), 0, [])
            return

        print("\n Scoring and ranking obligations...")

        scored_obligations = []
        for obl in obligations:
            scores = calculate_obligation_score(obl)
            obl['scores'] = scores
            obl['total_score'] = scores['total_score']
            scored_obligations.append(obl)

        scored_obligations.sort(key=lambda x: x['total_score'], reverse=True)
        top_obligations = scored_obligations[:5]

        print(f"OK Identified top {len(top_obligations)} priority obligations\n")

        generate_daily_dashboard(top_obligations)

        print("\n" + "="*80)
        print(" AGENTIC ACTION APPROVAL WORKFLOW")
        print("="*80)
        print("Review each prepared action and choose: [R]eview/Edit | [A]pprove & Execute | [S]kip\n")

        for idx, obl in enumerate(top_obligations, 1):
            micro_action_data = obl.get('micro_action_data')

            if not micro_action_data or not micro_action_data.get('requires_approval'):
                continue

            print(f"\n[{idx}] {obl['summary']}")
            safe_print(f"    Micro-Action: {micro_action_data['micro_action']}")

            if micro_action_data.get('prepared_content'):
                print(f"\n    --- PREPARED CONTENT FOR REVIEW ---")
                safe_print(f"    {micro_action_data['prepared_content']}")
                print(f"    --- END ---")

            print(f"\n    Options: [R]eview/Edit | [A]pprove & Execute | [S]kip")
            print(f"    (MVP: Simulating user choice as 'Skip' for safety)")

            user_choice = 'skip'

            if user_choice.lower() in ['a', 'approve']:
                result = execute_micro_action(obl['obligation_id'], micro_action_data, 'approve')
                print(f"    OK Result: {result['status']} - {result['message']}")
            else:
                log_action(obl['obligation_id'], micro_action_data['action_type'], micro_action_data, 'skipped', user_choice)
                print(f"    Result: Skipped by user")

        print("\n" + "="*80)
        print(f" All actions logged to action_log.json")
        print("="*80 + "\n")

        log_daily_summary(len(emails), len(obligations), top_obligations)

    except FileNotFoundError:
        print("\n Gmail credentials not found")
        print("To set up Gmail integration:")
        print("  1. Go to https://console.cloud.google.com/apis/credentials")
        print("  2. Create OAuth 2.0 credentials")
        print("  3. Download as 'credentials.json'")
        print("  4. Place in project directory\n")
    except Exception as e:
        safe_print(f"\n Error during daily check: {str(e)}\n")

def log_daily_summary(total_emails, total_obligations, top_obligations):
    summary = {
        'timestamp': datetime.now().isoformat(),
        'total_emails': total_emails,
        'total_obligations': total_obligations,
        'top_obligations': [
            {
                'obligation_id': obl.get('obligation_id'),
                'summary': obl.get('summary'),
                'score': obl.get('total_score')
            } for obl in top_obligations
        ]
    }

    daily_summaries = []
    if os.path.exists('daily_summaries.json'):
        try:
            with open('daily_summaries.json', 'r') as f:
                daily_summaries = json.load(f)
        except:
            daily_summaries = []

    daily_summaries.append(summary)

    with open('daily_summaries.json', 'w') as f:
        json.dump(daily_summaries, f, indent=2)

def generate_daily_dashboard(top_obligations):
    print("\n" + "="*80)
    print(" DAILY OBLIGATION DASHBOARD")
    print("="*80)
    print(f" {datetime.now().strftime('%A, %B %d, %Y')}")
    print(f" Top {len(top_obligations)} Priorities for Today:\n")
    print("="*80)

    for idx, obl in enumerate(top_obligations, 1):
        obligation_id = f"obl_{datetime.now().strftime('%Y%m%d')}_{idx}"
        obl['obligation_id'] = obligation_id

        deadline_str = obl.get('deadline', 'No deadline')
        if deadline_str and deadline_str != "null":
            deadline_display = f"by {deadline_str}"
        else:
            deadline_display = "No specific deadline"

        print(f"\n[{idx}] {obl['summary']}")
        print(f"     Deadline: {deadline_display}")
        print(f"     Stakes: {obl['stakes']}")
        print(f"     Authority: {obl['authority']}")
        print(f"     Blocking: {'Yes' if obl.get('blocking') else 'No'}")
        print(f"     Priority Score: {obl['total_score']:.1f}/50")

        try:
            micro_action_data = generate_micro_action_and_motivation(obl)
            obl['micro_action_data'] = micro_action_data

            print(f"     Micro-Action: {micro_action_data['micro_action']}")
            print(f"     Motivation: {micro_action_data['motivation']}")

            if micro_action_data.get('prepared_content'):
                print(f"    OK AI has prepared content for your review")
        except Exception as e:
            print(f"    WARNING:  Error generating micro-action: {str(e)}")

    print("\n" + "="*80)
    print(" All obligations logged and ready for review")
    print("="*80 + "\n")

    return top_obligations

@app.post("/analyze_email/")
async def analyze_email(request: EmailRequest):
    try:
        result = analyze_email_with_claude(request.email_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/fetch_and_analyze/")
async def fetch_and_analyze():
    try:
        emails = fetch_gmail_emails(max_results=50)
        results = []

        for email in emails:
            analysis = analyze_email_with_claude(email['full_text'])

            if analysis.get('requires_action'):
                scores = calculate_obligation_score(analysis)
                analysis['scores'] = scores
                analysis['total_score'] = scores['total_score']

            results.append({
                'email': {
                    'subject': email['subject'],
                    'sender': email['sender'],
                    'date': email['date']
                },
                'analysis': analysis
            })

        return {"total_emails": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/daily_digest/")
async def daily_digest(top_n: int = 5):
    try:
        # Check if Gmail credentials AND token exist
        if not os.path.exists('credentials.json') or not os.path.exists('token.json'):
            # Return demo data for testing
            return {
                "message": "Gmail not configured. Showing demo data. Click 'Trigger Daily Check' to set up Gmail.",
                "total_obligations": 3,
                "top_obligations": [
                    {
                        "obligation_id": "demo_1",
                        "summary": "Complete project proposal for client meeting",
                        "action": "Finalize and send the project proposal document",
                        "deadline": "2026-01-22",
                        "stakes": "Missing deadline could delay project start",
                        "authority": "Client - ABC Corp",
                        "blocking": True,
                        "total_score": 45.5,
                        "deadline_score": 10,
                        "micro_action": "Open the draft and add final pricing details",
                        "motivation": "Your client is waiting - finish strong!",
                        "action_type": "email_draft",
                        "prepared_content": "Hi Team,\n\nPlease find attached our project proposal...",
                        "requires_approval": True,
                        "safety_flags": []
                    },
                    {
                        "obligation_id": "demo_2",
                        "summary": "Respond to professor about assignment extension",
                        "action": "Email professor requesting deadline extension",
                        "deadline": "2026-01-21",
                        "stakes": "Could affect course grade",
                        "authority": "Prof. Smith",
                        "blocking": False,
                        "total_score": 38.2,
                        "deadline_score": 12,
                        "micro_action": "Draft a brief, professional extension request email",
                        "motivation": "Quick 5-minute task - do it now!",
                        "action_type": "email_draft",
                        "prepared_content": "Dear Professor Smith,\n\nI hope this email finds you well...",
                        "requires_approval": True,
                        "safety_flags": []
                    },
                    {
                        "obligation_id": "demo_3",
                        "summary": "Review and approve team's pull request",
                        "action": "Code review the authentication feature PR",
                        "deadline": None,
                        "stakes": "Team is blocked on this task",
                        "authority": "Development Team",
                        "blocking": True,
                        "total_score": 32.0,
                        "deadline_score": 5,
                        "micro_action": "Open GitHub and check the PR diff",
                        "motivation": "Your team is counting on you!",
                        "action_type": "checklist",
                        "prepared_content": "1. Review code changes\n2. Test locally\n3. Leave feedback\n4. Approve or request changes",
                        "requires_approval": False,
                        "safety_flags": []
                    }
                ]
            }

        emails = fetch_gmail_emails(max_results=50)
        obligations = []

        for email in emails:
            analysis = analyze_email_with_claude(email['full_text'])
            if analysis.get('requires_action'):
                obligations.append(analysis)

        scored_obligations = []
        for obl in obligations:
            scores = calculate_obligation_score(obl)
            obl['scores'] = scores
            obl['total_score'] = scores['total_score']
            scored_obligations.append(obl)

        scored_obligations.sort(key=lambda x: x['total_score'], reverse=True)
        top_obligations = scored_obligations[:top_n]

        digest = []
        for idx, obl in enumerate(top_obligations, 1):
            obligation_id = f"obl_{datetime.now().strftime('%Y%m%d')}_{idx}"
            micro_action_data = generate_micro_action_and_motivation(obl)

            digest.append({
                'obligation_id': obligation_id,
                'summary': obl['summary'],
                'action': obl['action'],
                'deadline': obl.get('deadline'),
                'stakes': obl['stakes'],
                'authority': obl['authority'],
                'score': obl['total_score'],
                'micro_action': micro_action_data['micro_action'],
                'motivation': micro_action_data['motivation'],
                'action_type': micro_action_data['action_type'],
                'prepared_content': micro_action_data.get('prepared_content'),
                'requires_approval': micro_action_data['requires_approval'],
                'safety_flags': micro_action_data['safety_flags']
            })

        return {
            'total_obligations': len(obligations),
            'top_priorities': digest
        }
    except Exception as e:
        # If API fails (e.g., no credits), return demo data instead of error
        return {
            "message": "API Error - Showing demo data. (Error: " + str(e)[:100] + ")",
            "total_obligations": 3,
            "top_obligations": [
                {
                    "obligation_id": "demo_1",
                    "summary": "Complete project proposal for client meeting",
                    "action": "Finalize and send the project proposal document",
                    "deadline": "2026-01-22",
                    "stakes": "Missing deadline could delay project start",
                    "authority": "Client - ABC Corp",
                    "blocking": True,
                    "total_score": 45.5,
                    "deadline_score": 10,
                    "micro_action": "Open the draft and add final pricing details",
                    "motivation": "Your client is waiting - finish strong!",
                    "action_type": "email_draft",
                    "prepared_content": "Hi Team, Please find attached our project proposal...",
                    "requires_approval": True,
                    "safety_flags": []
                },
                {
                    "obligation_id": "demo_2",
                    "summary": "Respond to professor about assignment extension",
                    "action": "Email professor requesting deadline extension",
                    "deadline": "2026-01-21",
                    "stakes": "Could affect course grade",
                    "authority": "Prof. Smith",
                    "blocking": False,
                    "total_score": 38.2,
                    "deadline_score": 12,
                    "micro_action": "Draft a brief, professional extension request email",
                    "motivation": "Quick 5-minute task - do it now!",
                    "action_type": "email_draft",
                    "prepared_content": "Dear Professor Smith, I hope this email finds you well...",
                    "requires_approval": True,
                    "safety_flags": []
                },
                {
                    "obligation_id": "demo_3",
                    "summary": "Review teammate's pull request",
                    "action": "Review and provide feedback on PR #42",
                    "deadline": "2026-01-23",
                    "stakes": "Teammate blocked on this review",
                    "authority": "Team Lead",
                    "blocking": True,
                    "total_score": 35.8,
                    "deadline_score": 6,
                    "micro_action": "Open GitHub and review the code changes",
                    "motivation": "Unblock your teammate - takes 10 minutes!",
                    "action_type": "checklist",
                    "prepared_content": "1. Review code changes 2. Test locally 3. Leave feedback",
                    "requires_approval": False,
                    "safety_flags": []
                }
            ]
        }

@app.post("/approve_action/")
async def approve_action(request: MicroActionRequest):
    try:
        if request.approval.lower() not in ['approve', 'skip', 'edit']:
            raise HTTPException(status_code=400, detail="Invalid approval status")

        action_data = json.loads(request.action)

        if request.approval.lower() == 'approve':
            result = execute_micro_action(request.obligation_id, action_data, 'approve')
            return result
        else:
            log_action(request.obligation_id, action_data['action_type'], action_data, request.approval.lower(), None)
            return {'status': request.approval.lower(), 'message': f'Action {request.approval.lower()} by user'}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/action_log/")
async def get_action_log():
    try:
        return {'log_entries': action_log}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/trigger_daily_check/")
async def trigger_daily_check():
    try:
        thread = threading.Thread(target=run_daily_obligation_check)
        thread.start()
        return {"status": "triggered", "message": "Daily obligation check started in background"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def setup_scheduler():
    scheduler.add_job(
        run_daily_obligation_check,
        CronTrigger(hour=8, minute=0),
        id='daily_obligation_check',
        name='Daily Obligation Check',
        replace_existing=True
    )

    print("\nScheduler configured:")
    print(f"   Daily obligation check will run at 8:00 AM every day")

    scheduler.start()

if __name__ == "__main__":
    print("\n" + "="*80)
    print("OBLIGATION DETECTION AI - SCHEDULED DAILY SERVICE")
    print("="*80)
    print("Features:")
    print("  - Automatic daily execution (scheduled)")
    print("  - Live Gmail integration (auto-fetch 50 emails)")
    print("  - Claude API obligation detection")
    print("  - Intelligent scoring and ranking")
    print("  - Daily dashboard with top 5 priorities")
    print("  - Agentic micro-actions with motivation")
    print("  - User approval workflow")
    print("  - Complete action logging")
    print("  - Safety boundaries (simulation only)")
    print("="*80 + "\n")

    print("  ENVIRONMENT SETUP CHECK")
    print("-"*80)

    api_key = os.getenv("CLAUDE_API_KEY")
    if not api_key:
        print(" CLAUDE_API_KEY not found in environment")
        print("To set up:")
        print("  1. Create a .env file in the project directory")
        print("  2. Add: CLAUDE_API_KEY=your_api_key_here")
        print("  3. Get your API key from https://console.anthropic.com/")
        print("\nExiting...\n")
        exit(1)
    else:
        print("OK CLAUDE_API_KEY found")

    if os.path.exists('credentials.json'):
        print("OK Gmail credentials.json found")
    else:
        print("WARNING:  Gmail credentials.json not found")
        print("   Gmail integration will not work without credentials")

    if os.path.exists('token.json'):
        print("OK Gmail token.json found (already authenticated)")
    else:
        print("INFO:  Gmail token.json not found (will authenticate on first run)")

    print("-"*80 + "\n")

    print(" INITIAL RUN: Running daily check immediately...")
    print("-"*80)

    try:
        run_daily_obligation_check()
        print("OK Initial run completed successfully\n")
    except Exception as e:
        print(f"WARNING:  Initial run encountered an error: {str(e)}")
        print("Service will continue and retry at scheduled time\n")

    print("\n" + "="*80)
    print("SETTING UP SCHEDULER")
    print("="*80)

    setup_scheduler()

    print("\n" + "="*80)
    print(" STARTING FASTAPI SERVER")
    print("="*80)
    print("Available Endpoints:")
    print("  POST /analyze_email/           - Analyze a single email")
    print("  GET  /fetch_and_analyze/       - Fetch from Gmail and analyze all")
    print("  GET  /daily_digest/?top_n=5    - Get daily priority digest")
    print("  POST /approve_action/          - Approve or reject a prepared action")
    print("  GET  /action_log/              - View all logged actions")
    print("  GET  /trigger_daily_check/     - Manually trigger daily check")
    print("="*80)
    print("\n Server will start at: http://localhost:8000")
    print(" API docs available at: http://localhost:8000/docs")
    print("Daily checks scheduled for 8:00 AM every day")
    print("="*80 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=8000)
