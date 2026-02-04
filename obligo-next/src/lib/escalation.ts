/**
 * PHASE 1 STEP 5 — Escalation States
 *
 * DETERMINISTIC. No AI. No predictions. No scoring models.
 *
 * This module computes escalation levels from obligation data using only:
 * - obligation.status
 * - obligation.deadline
 * - obligation.proof_required
 * - whether proof exists (passed in as a boolean)
 *
 * The result is a LABEL, not a decision. The label drives visual loudness.
 *
 * WHY THIS IS INTENTIONALLY LOUD:
 * A user must not be able to scroll past a failing obligation without noticing it.
 * If the system feels annoying, it is probably correct.
 *
 * WHY THERE IS NO AI HERE:
 * Escalation is arithmetic. deadline minus today equals days remaining.
 * Status is an enum. Proof exists or it doesn't.
 * Future you will be tempted to "make it smarter." Don't.
 *
 * CONFIGURABLE THRESHOLDS (change these, not the logic):
 */

export const ESCALATION_THRESHOLDS = {
  /** Days before deadline where status becomes URGENT */
  URGENT_DAYS: 7,
  /** Days before deadline where status becomes CRITICAL */
  CRITICAL_DAYS: 3,
} as const;

export type EscalationLevel = "normal" | "urgent" | "critical" | "failure";

interface EscalationInput {
  status: string;
  deadline: string | null;
  proof_required: boolean;
  /** Whether proof has been attached (from obligation_proofs table) */
  has_proof: boolean;
}

/**
 * Compute escalation level. Pure function. No side effects. No network calls.
 *
 * Rules:
 * - FAILURE:  deadline passed, obligation not verified
 * - CRITICAL: deadline <= 3 days, proof missing OR not verified
 * - URGENT:   deadline <= 7 days, not verified
 * - NORMAL:   everything else
 *
 * Verified obligations always return NORMAL — they're done.
 */
export function getEscalationLevel(input: EscalationInput): EscalationLevel {
  // Verified = done. No escalation.
  if (input.status === "verified") return "normal";

  // No deadline = can't compute time-based escalation.
  // Still could be proof-missing, but that's Step 4's domain.
  if (!input.deadline) return "normal";

  const now = new Date();
  const deadline = new Date(input.deadline);
  const msRemaining = deadline.getTime() - now.getTime();
  const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

  // FAILURE: deadline passed, not verified
  if (daysRemaining < 0) {
    return "failure";
  }

  // CRITICAL: deadline <= 3 days AND (proof missing on proof-required, OR still pending/blocked)
  if (daysRemaining <= ESCALATION_THRESHOLDS.CRITICAL_DAYS) {
    // If proof is required but missing, always critical
    if (input.proof_required && !input.has_proof) return "critical";
    // If not yet submitted, critical (you're running out of time)
    if (input.status === "pending" || input.status === "blocked") return "critical";
    // Submitted but close to deadline — still critical until verified
    return "critical";
  }

  // URGENT: deadline <= 7 days, not verified
  if (daysRemaining <= ESCALATION_THRESHOLDS.URGENT_DAYS) {
    return "urgent";
  }

  return "normal";
}

/**
 * Detect silent failure condition.
 *
 * Silent failure = obligation was submitted, proof is required,
 * but no confirmation exists. The user THINKS it's done. It isn't.
 *
 * This is distinct from escalation — an obligation can be NORMAL escalation
 * (deadline far away) but still be a silent failure (submitted without proof).
 */
export function isSilentFailure(input: {
  status: string;
  proof_required: boolean;
  has_proof: boolean;
}): boolean {
  return (
    input.status === "submitted" &&
    input.proof_required &&
    !input.has_proof
  );
}

/**
 * Whether verification should be BLOCKED at this escalation level.
 *
 * At CRITICAL and FAILURE, you cannot mark as verified without proof.
 * This prevents dangerous optimism — the user cannot dismiss a failing
 * obligation by clicking "Verify" without evidence.
 */
export function isVerificationBlocked(
  escalation: EscalationLevel,
  proof_required: boolean,
  has_proof: boolean
): boolean {
  if (!proof_required) return false;
  if (has_proof) return false;
  // Block at CRITICAL and FAILURE when proof is missing
  return escalation === "critical" || escalation === "failure";
}

/**
 * Visual config for each escalation level.
 *
 * WHY THESE ARE LOUD:
 * NORMAL = invisible. URGENT = visible. CRITICAL = impossible to miss.
 * FAILURE = the system is yelling at you because something broke.
 */
export const ESCALATION_STYLES: Record<
  EscalationLevel,
  {
    rowBorder: string;
    rowBg: string;
    badge: string;
    badgeText: string;
    label: string;
    deadlineColor: string;
    statusColor: string;
  }
> = {
  normal: {
    rowBorder: "",
    rowBg: "",
    badge: "",
    badgeText: "",
    label: "",
    deadlineColor: "text-gray-700",
    statusColor: "text-gray-400",
  },
  urgent: {
    rowBorder: "border-l-4 border-l-yellow-500",
    rowBg: "bg-yellow-50/50",
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    badgeText: "URGENT",
    label: "Deadline approaching",
    deadlineColor: "text-yellow-700 font-bold",
    statusColor: "text-yellow-600",
  },
  critical: {
    rowBorder: "border-l-4 border-l-red-500",
    rowBg: "bg-red-50/60",
    badge: "bg-red-100 text-red-800 border border-red-400",
    badgeText: "CRITICAL",
    label: "Immediate action required",
    deadlineColor: "text-red-700 font-bold",
    statusColor: "text-red-600",
  },
  failure: {
    rowBorder: "border-l-4 border-l-red-700",
    rowBg: "bg-red-100/70",
    badge: "bg-red-700 text-white border border-red-800",
    badgeText: "FAILED",
    label: "Deadline passed without verification",
    deadlineColor: "text-red-800 font-black",
    statusColor: "text-red-700 font-bold",
  },
};

/**
 * Human-readable days remaining string.
 * No softening. "0 days" means today. Negative means overdue.
 */
export function daysRemainingText(deadline: string | null): string | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const days = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days remaining`;
}
