# Obligo API Reference

## Base URL
```
http://localhost:8000
```

Production: Replace with your domain (e.g., `https://api.obligo.com`)

---

## Authentication Endpoints

### 1. Initiate Gmail OAuth
**Endpoint**: `GET /oauth/gmail` (not implemented - uses local flow)
**Description**: Gmail uses `credentials.json` + `token.json` for local OAuth.

### 2. Initiate Outlook OAuth
```http
GET /oauth/outlook
```

**Description**: Redirects user to Microsoft consent screen

**Response**: `302 Redirect` to Microsoft login

**Example**:
```bash
curl -L http://localhost:8000/oauth/outlook
```

**Frontend Usage**:
```javascript
window.location.href = 'http://localhost:8000/oauth/outlook';
```

---

### 3. Outlook OAuth Callback
```http
GET /oauth/outlook/callback?code={auth_code}
```

**Description**: Handles Microsoft OAuth callback, exchanges code for tokens

**Query Parameters**:
- `code` (string, required) - Authorization code from Microsoft
- `error` (string, optional) - Error code if auth failed

**Response**: `302 Redirect` to frontend
- Success: `{FRONTEND_URL}?oauth_success=outlook`
- Error: `{FRONTEND_URL}?oauth_error={error_message}`

**Example**: (Handled automatically by Microsoft, not called directly)

---

## Data Endpoints

### 4. Health Check
```http
GET /
```

**Description**: Check if API is running

**Response**:
```json
{
  "status": "healthy",
  "service": "Obligo API",
  "version": "1.0.0",
  "timestamp": "2026-01-22T10:30:00.000000"
}
```

**Example**:
```bash
curl http://localhost:8000/
```

---

### 5. Get Daily Digest
```http
GET /daily_digest/?top_n={number}&provider={source}
```

**Description**: Get top obligations from email sources

**Query Parameters**:
- `top_n` (integer, optional, default: 5) - Number of top obligations to return
- `provider` (string, optional, default: "all") - Email source filter
  - `all` - Both Gmail and Outlook
  - `gmail` - Only Gmail
  - `outlook` - Only Outlook

**Response**:
```json
{
  "sources": ["gmail", "outlook"],
  "total_obligations": 12,
  "top_obligations": [
    {
      "obligation_id": "obl_20260122_1",
      "summary": "Complete project proposal for client meeting",
      "action": "Finalize and send the project proposal document",
      "deadline": "2026-01-24",
      "deadline_implied": false,
      "stakes": "Missing deadline could delay project start",
      "authority": "Client - ABC Corp",
      "blocking": true,
      "email_source": "outlook",
      "email_id": "AAMkAGI1...",
      "sender": "John Doe <john@outlook.com>",
      "total_score": 45.5,
      "deadline_score": 10,
      "authority_score": 8,
      "stakes_score": 10,
      "blocking_score": 8,
      "relevance_score": 5,
      "micro_action": "Open the draft and add final pricing details",
      "motivation": "Your client is waiting - finish strong!",
      "action_type": "email_draft",
      "prepared_content": "Hi Team,\n\nPlease find attached our project proposal...",
      "requires_approval": true,
      "safety_flags": []
    }
  ]
}
```

**Examples**:
```bash
# Get top 5 from all sources
curl http://localhost:8000/daily_digest/

# Get top 10 from all sources
curl http://localhost:8000/daily_digest/?top_n=10

# Get only Gmail obligations
curl http://localhost:8000/daily_digest/?provider=gmail

# Get only Outlook obligations
curl http://localhost:8000/daily_digest/?provider=outlook

# Get top 3 from Outlook only
curl http://localhost:8000/daily_digest/?top_n=3&provider=outlook
```

**Frontend Usage**:
```javascript
fetch('http://localhost:8000/daily_digest/?top_n=5')
  .then(res => res.json())
  .then(data => {
    console.log('Sources:', data.sources);
    console.log('Obligations:', data.top_obligations);
  });
```

**Error Response** (No emails configured):
```json
{
  "message": "No email sources configured. Showing demo data.",
  "sources": [],
  "total_obligations": 3,
  "top_obligations": [/* demo data */]
}
```

---

### 6. Approve/Skip Obligation
```http
POST /approve_action/
Content-Type: application/json
```

**Description**: Log user action on an obligation

**Request Body**:
```json
{
  "obligation_id": "obl_20260122_1",
  "approval_status": "done",
  "user_notes": "Completed and sent to client"
}
```

**Body Parameters**:
- `obligation_id` (string, required) - ID of the obligation
- `approval_status` (string, required) - User action taken
  - `done` - Marked as completed
  - `snoozed` - Postponed for later
  - `approved` - Approved for execution
  - `skipped` - Dismissed/ignored
- `user_notes` (string, optional) - Additional notes

**Response**:
```json
{
  "status": "success",
  "message": "Obligation done",
  "obligation_id": "obl_20260122_1",
  "timestamp": "2026-01-22T10:30:00.000000"
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/approve_action/ \
  -H "Content-Type: application/json" \
  -d '{
    "obligation_id": "obl_20260122_1",
    "approval_status": "done",
    "user_notes": "Sent proposal at 10am"
  }'
```

**Frontend Usage**:
```javascript
async function markAsDone(obligationId) {
  const response = await fetch('http://localhost:8000/approve_action/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      obligation_id: obligationId,
      approval_status: 'done',
      user_notes: 'Completed via UI'
    })
  });
  return response.json();
}
```

---

### 7. Trigger Daily Check
```http
GET /trigger_daily_check/
```

**Description**: Manually trigger daily obligation check

**Response**:
```json
{
  "status": "success",
  "message": "Daily check triggered",
  "timestamp": "2026-01-22T10:30:00.000000"
}
```

**Example**:
```bash
curl http://localhost:8000/trigger_daily_check/
```

---

### 8. Get Action Log
```http
GET /action_log/
```

**Description**: Retrieve all logged actions (admin endpoint)

**Response**:
```json
{
  "logs": [
    {
      "timestamp": "2026-01-21T09:14:31.343301",
      "user_id": "default_user",
      "obligation_id": "demo_1",
      "action": "user_action",
      "approval_status": "snoozed",
      "score": 0.0,
      "notes": "Will do this tomorrow"
    }
  ],
  "count": 3
}
```

**Example**:
```bash
curl http://localhost:8000/action_log/
```

---

## Response Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Data retrieved successfully |
| 302 | Redirect | OAuth flow redirects |
| 400 | Bad Request | Missing required parameters |
| 401 | Unauthorized | Invalid/expired OAuth token |
| 500 | Server Error | Internal error, check logs |

---

## Data Models

### Obligation Object
```typescript
interface Obligation {
  obligation_id: string;           // "obl_20260122_1"
  summary: string;                  // Brief description
  action: string;                   // What needs to be done
  deadline: string;                 // "YYYY-MM-DD" or "TBD"
  deadline_implied: boolean;        // Was deadline inferred?
  stakes: string;                   // Consequences if not done
  authority: string;                // Who is requesting
  blocking: boolean;                // Blocks others?
  email_source: string;             // "gmail" | "outlook"
  email_id: string;                 // Source email ID
  sender: string;                   // Email sender
  total_score: number;              // Priority score (0-100+)
  deadline_score: number;           // Urgency component
  authority_score: number;          // Authority component
  stakes_score: number;             // Stakes component
  blocking_score: number;           // Blocking component
  relevance_score: number;          // Relevance component
  micro_action: string;             // First small step
  motivation: string;               // Encouraging message
  action_type: string;              // "task" | "email_draft" | "checklist"
  prepared_content: string | null;  // Pre-drafted content
  requires_approval: boolean;       // Needs user review?
  safety_flags: string[];           // Safety warnings
}
```

### Action Log Entry
```typescript
interface ActionLogEntry {
  timestamp: string;                // ISO 8601 datetime
  user_id: string;                  // "default_user"
  obligation_id: string;            // Obligation ID
  action: string;                   // "user_action"
  approval_status: string;          // "done" | "snoozed" | "approved" | "skipped"
  score: number;                    // Priority score at time of action
  notes: string;                    // User notes
}
```

---

## Testing with cURL

### Complete Workflow Example

1. **Check API health**:
```bash
curl http://localhost:8000/
```

2. **Authenticate with Outlook** (in browser):
```
http://localhost:8000/oauth/outlook
```

3. **Get obligations**:
```bash
curl http://localhost:8000/daily_digest/?top_n=5
```

4. **Mark one as done**:
```bash
curl -X POST http://localhost:8000/approve_action/ \
  -H "Content-Type: application/json" \
  -d '{
    "obligation_id": "obl_20260122_1",
    "approval_status": "done",
    "user_notes": "Completed"
  }'
```

5. **View action log**:
```bash
curl http://localhost:8000/action_log/
```

---

## Rate Limits

Currently: **No rate limits** (development)

For production:
- OAuth endpoints: 10 requests/hour per IP
- Data endpoints: 100 requests/hour per user
- Daily digest: 60 requests/hour per user

---

## CORS Policy

Current: **All origins allowed** (development)

```python
allow_origins=["*"]
```

For production, restrict to your frontend domain:
```python
allow_origins=["https://app.obligo.com"]
```

---

## API Documentation (Interactive)

FastAPI provides auto-generated interactive docs:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

These show all endpoints, request/response schemas, and allow testing directly in browser.

---

## Environment Variables

Required in `.env`:

```env
# Claude AI
CLAUDE_API_KEY=sk-ant-api03-...

# Outlook OAuth
OUTLOOK_CLIENT_ID=a1b2c3d4-...
OUTLOOK_CLIENT_SECRET=AbC~dEf1...
OUTLOOK_REDIRECT_URI=http://localhost:8000/oauth/outlook/callback

# Frontend
FRONTEND_URL=http://localhost:3000
```

See [OUTLOOK_SETUP.md](OUTLOOK_SETUP.md) for Outlook configuration.

---

## Support

- **Setup Help**: See [OUTLOOK_SETUP.md](OUTLOOK_SETUP.md)
- **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Logs**: Check `obligo.log` for detailed error messages
- **Interactive Testing**: Use http://localhost:8000/docs

---

**Last Updated**: January 22, 2026
**API Version**: 1.0.0
