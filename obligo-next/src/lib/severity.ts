/**
 * PHASE 3 STEP 1 — Deterministic Severity System
 *
 * DETERMINISTIC. No AI. No predictions. No "urgency vibes."
 *
 * This module computes severity from obligation data using only:
 * - obligation.status
 * - obligation.deadline
 * - obligation.stuck (system-derived, Phase 2 Step 4)
 * - whether the obligation is verified
 *
 * Severity reflects CONSEQUENCE, not urgency. A high-severity obligation
 * is one where inaction leads to real loss — not one that "feels" important.
 *
 * WHY SEVERITY IS SEPARATE FROM ESCALATION:
 * Escalation (Phase 1 Step 5) drives BEHAVIORAL checks (verification blocking,
 * proof gating). Severity drives VISUAL treatment (badges, row colors, stat cards).
 * Both are deterministic. Both are arithmetic. They serve different purposes.
 *
 * DEFAULT BIAS: Understate early, overstate late.
 * An obligation 20 days before deadline should feel calm.
 * An obligation 2 days before deadline should feel alarming.
 * This is intentional. The system does not cry wolf.
 *
 * SEVERITY IS NOT USER-EDITABLE.
 * Users cannot set severity. The system derives it from facts.
 * If the facts change (deadline changes, stuck clears), severity changes.
 *
 * CONFIGURABLE THRESHOLDS (change these, not the logic):
 */

export const SEVERITY_THRESHOLDS = {
  /** Days before deadline where severity can reach HIGH */
  HIGH_DAYS: 3,
  /** Days before deadline where STUCK obligations reach minimum HIGH */
  STUCK_HIGH_DAYS: 7,
  /** Days before deadline where severity can reach ELEVATED */
  ELEVATED_DAYS: 14,
} as const;

/**
 * Five levels. No others. Exact list.
 *
 * NORMAL:   No action pressure. Deadline far or nonexistent.
 * ELEVATED: Mild time pressure or structural concern (stuck without deadline pressure).
 * HIGH:     Significant time pressure or stuck with approaching deadline.
 * CRITICAL: Imminent deadline + stuck. Maximum actionable urgency.
 * FAILED:   Deadline passed without verification. Non-reversible by time.
 */
export type SeverityLevel = "normal" | "elevated" | "high" | "critical" | "failed";

/**
 * Severity reason taxonomy. Each severity has exactly one dominant cause.
 * This is what the system shows when asked "why is this severity X?"
 * One sentence. No advice. No suggestions.
 */
export type SeverityReason =
  | "verified"
  | "deadline_passed"
  | "stuck_deadline_imminent"
  | "deadline_imminent"
  | "stuck_deadline_approaching"
  | "deadline_approaching"
  | "stuck_no_deadline_pressure"
  | "no_pressure";

interface SeverityInput {
  status: string;
  deadline: string | null;
  stuck: boolean;
}

export interface SeverityResult {
  level: SeverityLevel;
  reason: SeverityReason;
}

/**
 * Compute severity level. Pure function. No side effects. No network calls.
 *
 * RULES (evaluated in order, first match wins):
 *
 * 1. verified                          → Normal  ("verified")
 * 2. deadline passed                   → Failed  ("deadline_passed")       [non-reversible]
 * 3. deadline <= 3 days AND stuck      → Critical ("stuck_deadline_imminent")
 * 4. deadline <= 3 days                → High    ("deadline_imminent")
 * 5. stuck AND deadline <= 7 days      → High    ("stuck_deadline_approaching")
 * 6. deadline <= 14 days               → Elevated ("deadline_approaching")
 * 7. stuck (no deadline pressure)      → Elevated ("stuck_no_deadline_pressure")
 * 8. everything else                   → Normal  ("no_pressure")
 *
 * CONSTRAINTS ENCODED IN THE RULES:
 * - "Deadline > 14 days → cannot exceed Elevated" — Rules 2-6 all require deadline <= 14 days.
 *   Rule 7 (stuck, no deadline pressure) maxes at Elevated. Rule 8 is Normal.
 * - "STUCK + deadline < 7 days → minimum High" — Rule 5 guarantees this.
 * - "Deadline passed → Failed (non-reversible)" — Rule 2, first time-based check.
 */
export function computeSeverity(input: SeverityInput): SeverityResult {
  // Rule 1: Verified = done. No severity.
  if (input.status === "verified") {
    return { level: "normal", reason: "verified" };
  }

  // Time computation (only if deadline exists)
  if (input.deadline) {
    const now = new Date();
    const deadline = new Date(input.deadline);
    const msRemaining = deadline.getTime() - now.getTime();
    const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

    // Rule 2: Deadline passed → Failed. Non-reversible by time.
    if (daysRemaining < 0) {
      return { level: "failed", reason: "deadline_passed" };
    }

    // Rule 3: Deadline <= 3 days AND stuck → Critical
    if (daysRemaining <= SEVERITY_THRESHOLDS.HIGH_DAYS && input.stuck) {
      return { level: "critical", reason: "stuck_deadline_imminent" };
    }

    // Rule 4: Deadline <= 3 days → High
    if (daysRemaining <= SEVERITY_THRESHOLDS.HIGH_DAYS) {
      return { level: "high", reason: "deadline_imminent" };
    }

    // Rule 5: Stuck AND deadline <= 7 days → High (minimum High per spec)
    if (input.stuck && daysRemaining <= SEVERITY_THRESHOLDS.STUCK_HIGH_DAYS) {
      return { level: "high", reason: "stuck_deadline_approaching" };
    }

    // Rule 6: Deadline <= 14 days → Elevated
    if (daysRemaining <= SEVERITY_THRESHOLDS.ELEVATED_DAYS) {
      return { level: "elevated", reason: "deadline_approaching" };
    }
  }

  // Rule 7: Stuck with no deadline pressure → Elevated
  if (input.stuck) {
    return { level: "elevated", reason: "stuck_no_deadline_pressure" };
  }

  // Rule 8: Everything else → Normal
  return { level: "normal", reason: "no_pressure" };
}

/**
 * Visual config for each severity level.
 *
 * DESIGN DOCTRINE:
 * Normal = invisible. Elevated = visible. High = loud. Critical = impossible to miss.
 * Failed = the system is telling you something broke and time cannot fix it.
 *
 * These replace escalation styles for VISUAL purposes.
 * Escalation styles are still used for BEHAVIORAL checks (isVerificationBlocked).
 */
export const SEVERITY_STYLES: Record<
  SeverityLevel,
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
  elevated: {
    rowBorder: "border-l-4 border-l-yellow-500",
    rowBg: "bg-yellow-50/50",
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    badgeText: "ELEVATED",
    label: "Deadline approaching or structurally stuck",
    deadlineColor: "text-yellow-700 font-bold",
    statusColor: "text-yellow-600",
  },
  high: {
    rowBorder: "border-l-4 border-l-orange-500",
    rowBg: "bg-orange-50/50",
    badge: "bg-orange-100 text-orange-800 border border-orange-400",
    badgeText: "HIGH",
    label: "Significant time pressure",
    deadlineColor: "text-orange-700 font-bold",
    statusColor: "text-orange-600",
  },
  critical: {
    rowBorder: "border-l-4 border-l-red-500",
    rowBg: "bg-red-50/60",
    badge: "bg-red-100 text-red-800 border border-red-400",
    badgeText: "CRITICAL",
    label: "Stuck with imminent deadline",
    deadlineColor: "text-red-700 font-bold",
    statusColor: "text-red-600",
  },
  failed: {
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
 * Human-readable severity reason string.
 * One sentence per reason. Factual. No advice. No motivation.
 */
export const SEVERITY_REASON_TEXT: Record<SeverityReason, string> = {
  verified: "Obligation verified",
  deadline_passed: "Deadline passed without verification",
  stuck_deadline_imminent: "Stuck with deadline within 3 days",
  deadline_imminent: "Deadline within 3 days",
  stuck_deadline_approaching: "Stuck with deadline within 7 days",
  deadline_approaching: "Deadline within 14 days",
  stuck_no_deadline_pressure: "Structurally stuck, no deadline pressure",
  no_pressure: "No action pressure",
};
