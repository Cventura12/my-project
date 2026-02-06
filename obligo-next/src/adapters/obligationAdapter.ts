"use client";

import { UIObligationSummary } from "@/types/ui";
import { STATUS_LABELS } from "@/lib/copy";

function formatBlockedBy(blockedBy?: Array<{ type: string; title: string; status: string }>) {
  if (!blockedBy || blockedBy.length === 0) return "";
  const first = blockedBy[0];
  if (!first) return "";
  return `${first.type} (${first.status})`;
}

export function toUIObligationSummary(input: {
  obligation: any;
  schoolName?: string;
  proofs?: any[];
  blockedBy?: Array<{ type: string; title: string; status: string }>;
}): UIObligationSummary {
  const obl = input.obligation || {};
  const proofCount = input.proofs ? input.proofs.length : 0;
  const blockedBySummary = formatBlockedBy(input.blockedBy);
  const isBlocked = obl.status === "blocked" || !!blockedBySummary;

  let reasonLine = "No deadline";
  if (obl.status === "verified") reasonLine = STATUS_LABELS.verified;
  else if (obl.status === "failed") reasonLine = STATUS_LABELS.failed;
  else if (isBlocked) reasonLine = `Blocked by ${blockedBySummary || "dependency"}`;
  else if (obl.proof_required && proofCount === 0 && obl.status === "submitted") {
    reasonLine = STATUS_LABELS.proofMissing;
  } else if (obl.deadline) {
    reasonLine = `Due ${new Date(obl.deadline).toLocaleDateString()}`;
  }

  return {
    id: obl.id,
    title: obl.title || "Untitled obligation",
    type: obl.type || "UNKNOWN",
    schoolName: input.schoolName || "Unknown school",
    deadline: obl.deadline ? new Date(obl.deadline) : null,
    status: obl.status || "pending",
    severity: obl.severity || "normal",
    proofRequired: !!obl.proof_required,
    proofCount,
    isBlocked,
    blockedBySummary,
    stuck: !!obl.stuck,
    reasonLine,
  };
}
