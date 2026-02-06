# API Map (Frontend Usage)

Base URL: `NEXT_PUBLIC_API_URL` (fallback `http://localhost:8000`)

## Gmail / Signals
- `GET /oauth/gmail`  
  Used in `src/app/emails/page.tsx` (connect URL). Wrapped: **no** (link only).
- `GET /api/email/connection?user_id=`  
  Used in `src/lib/hooks/useEmails.ts`. Wrapped: **yes** (`api/inbox.ts`).
- `POST /api/email/scan`  
  Used in `src/lib/hooks/useEmails.ts`. Wrapped: **yes** (`api/inbox.ts`).
- `POST /api/email/dismiss`  
  Used in `src/lib/hooks/useEmails.ts`. Wrapped: **yes** (`api/inbox.ts`).
- `GET /api/email/history?user_id=`  
  Used in `src/app/emails/page.tsx` indirectly via `useEmails` (Supabase fetch), endpoint exists in backend. Wrapped: **yes** (`api/inbox.ts`).
- `POST /api/obligations/{id}/proofs/attach-confirmation-email`  
  Used in `src/app/emails/page.tsx`. Wrapped: **no** (not added in phase 3.1).

## Obligations
- `GET /api/obligations?user_id=`  
  Used in `src/lib/hooks/useObligations.ts` (Supabase direct) and backend API exists. Wrapped: **yes** (`api/obligations.ts`).
- `GET /api/obligations/{id}/steps?user_id=`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/obligations.ts`).
- `GET /api/obligations/proof-missing?user_id=`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/obligations.ts`).
- `GET /api/obligations/dependencies?user_id=`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/obligations.ts`).
- `GET /api/obligations/stuck-detection?user_id=`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/obligations.ts`).
- `POST /api/obligations/generate-recovery-drafts`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **no** (optional).
- `POST /api/obligations/{id}/overrides`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **no** (optional).

## Drafts / Approvals
- `POST /api/draft/create`  
  Used in `src/lib/hooks/useFollowUps.ts`. Wrapped: **yes** (`api/approvals.ts`).
- `POST /api/draft/improve`  
  Used in `src/lib/hooks/useFollowUps.ts`. Wrapped: **yes** (`api/approvals.ts`).
- `POST /api/draft/send`  
  Used in `src/lib/hooks/useFollowUps.ts`. Wrapped: **yes** (`api/approvals.ts`).
- `POST /api/draft/cancel`  
  Used in `src/lib/hooks/useFollowUps.ts`. Wrapped: **yes** (`api/approvals.ts`).
- `GET /api/draft/history?user_id=`  
  Used in `src/lib/hooks/useFollowUps.ts`. Wrapped: **yes** (`api/approvals.ts`).

## Intake
- `POST /api/intake/portal-paste`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/intake.ts`).
- `POST /api/intake/create`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/intake.ts`).
- `POST /api/intake/{id}/ocr`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/intake.ts`).
- `POST /api/intake/{id}/confirm`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/intake.ts`).
- `POST /api/intake/{id}/discard?user_id=`  
  Used in `src/app/financial-aid/page.tsx`. Wrapped: **yes** (`api/intake.ts`).
