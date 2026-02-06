"use client";

import { apiGet, apiPost } from "./client";

export function getEmailConnection(userId: string) {
  return apiGet<{ connected: boolean; provider?: string; email?: string; last_scan?: string }>(
    "/api/email/connection",
    { user_id: userId }
  );
}

export function scanEmail(userId: string) {
  return apiPost<{ status: string; scanned: number; new: number; actionable: number; errors: number }>(
    "/api/email/scan",
    { user_id: userId }
  );
}

export function dismissEmail(userId: string, emailId: string) {
  return apiPost<{ status: string }>(
    "/api/email/dismiss",
    { user_id: userId, email_id: emailId }
  );
}

export function listSignals(userId: string) {
  return apiGet<{ emails: any[]; count: number }>(
    "/api/email/history",
    { user_id: userId }
  );
}
