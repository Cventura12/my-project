"use client";

import { apiGet, apiPost } from "./client";

export function listDrafts(userId: string) {
  return apiGet<{ drafts: any[]; pending?: any[]; sent?: any[] }>(
    "/api/draft/history",
    { user_id: userId }
  );
}

export function createDraft(payload: {
  user_id: string;
  school_id: string;
  document_id?: string | null;
  draft_type?: string;
  inquiry_type?: string;
}) {
  return apiPost<{ follow_up: any }>(
    "/api/draft/create",
    payload
  );
}

export function improveDraft(payload: {
  user_id: string;
  follow_up_id: string;
  feedback: string;
}) {
  return apiPost<{ content: string }>(
    "/api/draft/improve",
    payload
  );
}

export function sendDraft(payload: {
  user_id: string;
  follow_up_id: string;
  edited_content?: string | null;
  edited_subject?: string | null;
}) {
  return apiPost<{ status?: string }>(
    "/api/draft/send",
    payload
  );
}

export function cancelDraft(payload: {
  user_id: string;
  follow_up_id: string;
}) {
  return apiPost<{ status?: string }>(
    "/api/draft/cancel",
    payload
  );
}
