"use client";

import { UISignal } from "@/types/ui";

export function toUISignalFromEmail(email: any): UISignal {
  return {
    id: email.id,
    sourceType: "email",
    subject: email.subject || "Untitled signal",
    from: email.sender || "Unknown sender",
    school: email.school_match || "Unknown school",
    deadline: email.deadline || null,
    confidence: email.confidence ?? null,
    category: email.category ?? null,
    requiresAction: !!email.requires_action,
    createdAt: email.created_at,
  };
}

export function toUISignalFromIntake(extraction: any): UISignal {
  return {
    id: extraction.id,
    sourceType: "intake",
    subject: "Intake extraction",
    from: "Intake",
    school: extraction.institution_candidate || "Unknown school",
    deadline: extraction.deadline_candidate || null,
    confidence: extraction.confidence ?? null,
    category: extraction.obligation_type_candidate ?? null,
    requiresAction: true,
    createdAt: extraction.created_at,
  };
}
