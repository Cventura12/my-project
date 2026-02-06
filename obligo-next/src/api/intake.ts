"use client";

import { apiPost } from "./client";

export function portalPaste(userId: string, rawText: string) {
  return apiPost<{ intake_item: any; extraction: any }>(
    "/api/intake/portal-paste",
    { user_id: userId, raw_text: rawText }
  );
}

export function createIntake(userId: string, source: "portal_paste" | "screenshot" | "pdf") {
  return apiPost<{ intake_item: any }>(
    "/api/intake/create",
    { user_id: userId, source }
  );
}

export function runOcr(intakeId: string, payload: {
  user_id: string;
  bucket: string;
  path: string;
  upload_id?: string;
  source: string;
}) {
  return apiPost<{ extraction: any }>(
    `/api/intake/${intakeId}/ocr`,
    payload
  );
}

export function confirmIntake(intakeId: string, userId: string) {
  return apiPost<{ status?: string }>(
    `/api/intake/${intakeId}/confirm`,
    { user_id: userId }
  );
}

export function discardIntake(intakeId: string, userId: string) {
  return apiPost<{ status?: string }>(
    `/api/intake/${intakeId}/discard`,
    undefined,
    { user_id: userId }
  );
}
