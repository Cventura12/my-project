/**
 * Obligo Priority Scoring System
 *
 * Calculates the urgency score (0-100) based on:
 * - Time pressure (40%)
 * - Consequence severity (30%)
 * - Who is waiting (15%)
 * - Origin type (10%)
 * - Relief effort (5%)
 */

import {
  Obligation,
  ConsequenceLevel,
  WhoIsWaiting,
  ObligationOrigin,
  CreateObligationInput,
} from "./obligation-model";

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const WEIGHTS = {
  timePressure: 40,
  consequence: 30,
  whoIsWaiting: 15,
  origin: 10,
  reliefEffort: 5,
} as const;

const CONSEQUENCE_SCORES: Record<ConsequenceLevel, number> = {
  critical: 30,
  high: 22,
  medium: 15,
  low: 8,
};

const WHO_WAITING_SCORES: Record<WhoIsWaiting, number> = {
  person: 15,  // Specific person = highest social pressure
  group: 12,   // Team/org expectations
  self: 8,     // Easier to rationalize delay
  unknown: 5,  // Vague anxiety
};

const ORIGIN_SCORES: Record<ObligationOrigin, number> = {
  promise: 10,     // You committed - highest accountability
  request: 8,      // Someone explicitly asked
  deadline: 7,     // External forcing function
  expectation: 5,  // Implied responsibility
};

// ============================================================================
// CORE SCORING FUNCTION
// ============================================================================

/**
 * Calculate priority score for an obligation
 * Returns a number 0-100 (higher = more urgent)
 */
export function calculatePriorityScore(
  obligation: Omit<Obligation, "priorityScore">
): number {
  const timePressureScore = calculateTimePressure(obligation);
  const consequenceScore = CONSEQUENCE_SCORES[obligation.consequence];
  const whoWaitingScore = WHO_WAITING_SCORES[obligation.whoIsWaiting];
  const originScore = ORIGIN_SCORES[obligation.origin];
  const reliefEffortScore = calculateReliefEffortScore(obligation.reliefAction.effortMinutes);

  const totalScore =
    timePressureScore +
    consequenceScore +
    whoWaitingScore +
    originScore +
    reliefEffortScore;

  // Clamp to 0-100
  return Math.min(100, Math.max(0, Math.round(totalScore)));
}

/**
 * Time pressure scoring (0-40 points)
 * Score increases as pressure date approaches
 */
function calculateTimePressure(
  obligation: Pick<Obligation, "pressureDate" | "dueDate" | "status">
): number {
  // Already done/ignored = no time pressure
  if (obligation.status === "done" || obligation.status === "ignored") {
    return 0;
  }

  const now = new Date();
  const pressureDate = new Date(obligation.pressureDate);

  // Days until pressure date (can be negative if past)
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilPressure = Math.floor(
    (pressureDate.getTime() - now.getTime()) / msPerDay
  );

  // Scoring curve:
  // - Past pressure date: 40 points (max urgency)
  // - Today: 35 points
  // - 1 day out: 30 points
  // - 3 days out: 20 points
  // - 7 days out: 5 points
  // - 14+ days out: 0 points

  if (daysUntilPressure <= 0) return WEIGHTS.timePressure; // Max urgency
  if (daysUntilPressure === 1) return 30;
  if (daysUntilPressure <= 3) return 20;
  if (daysUntilPressure <= 7) return 10;
  if (daysUntilPressure <= 14) return 5;

  return 0;
}

/**
 * Relief effort scoring (0-5 points)
 * Quick wins get bonus points
 */
function calculateReliefEffortScore(minutes: number): number {
  if (minutes <= 10) return 5;  // Quick win!
  if (minutes <= 30) return 3;  // Reasonable effort
  return 1;                     // Significant effort
}

// ============================================================================
// PRESSURE DATE CALCULATION
// ============================================================================

/**
 * Calculate pressure date from due date based on consequence level
 * This is when the obligation enters the "hot zone"
 */
export function calculatePressureDate(
  dueDate: Date | null,
  consequence: ConsequenceLevel
): Date {
  const now = new Date();

  if (!dueDate) {
    // No due date: use consequence-based offset from now
    const offsets: Record<ConsequenceLevel, number> = {
      critical: 7,  // Start feeling pressure in 1 week
      high: 5,
      medium: 3,
      low: 1,
    };
    const result = new Date(now);
    result.setDate(result.getDate() + offsets[consequence]);
    return result;
  }

  // Has due date: calculate backward from due date
  const offsets: Record<ConsequenceLevel, number> = {
    critical: 14, // Start 2 weeks before
    high: 7,      // Start 1 week before
    medium: 3,    // Start 3 days before
    low: 1,       // Start day before
  };

  const result = new Date(dueDate);
  result.setDate(result.getDate() - offsets[consequence]);

  // Don't set pressure date in the past if due date is far out
  if (result < now) {
    return now;
  }

  return result;
}

// ============================================================================
// OBLIGATION FACTORY
// ============================================================================

/**
 * Create a new obligation with computed fields
 */
export function createObligation(
  input: CreateObligationInput
): Obligation {
  const now = new Date().toISOString();

  // Create obligation without score first
  const obligationWithoutScore = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  // Calculate score
  const priorityScore = calculatePriorityScore(obligationWithoutScore as Omit<Obligation, "priorityScore">);

  return {
    ...obligationWithoutScore,
    priorityScore,
  };
}

/**
 * Generate a simple unique ID
 * In production, use uuid or nanoid
 */
function generateId(): string {
  return `obl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// SORTING & FILTERING
// ============================================================================

/**
 * Sort obligations by priority score (highest first)
 */
export function sortByPriority(obligations: Obligation[]): Obligation[] {
  return [...obligations].sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Get obligations that need attention (in hot zone)
 */
export function getHotObligations(obligations: Obligation[]): Obligation[] {
  const now = new Date();

  return obligations.filter((obl) => {
    if (obl.status !== "open") return false;
    const pressureDate = new Date(obl.pressureDate);
    return pressureDate <= now;
  });
}

/**
 * Get quick wins (can relieve in <15 minutes)
 */
export function getQuickWins(obligations: Obligation[]): Obligation[] {
  return obligations.filter(
    (obl) => obl.status === "open" && obl.reliefAction.effortMinutes <= 15
  );
}

// ============================================================================
// STATS
// ============================================================================

export interface ObligationStats {
  total: number;
  open: number;
  relieved: number;
  done: number;
  ignored: number;
  urgent: number;      // Score >= 70
  critical: number;    // consequence === 'critical'
  avgScore: number;
  quickWins: number;   // effortMinutes <= 15
}

/**
 * Calculate stats from obligations list
 */
export function calculateStats(obligations: Obligation[]): ObligationStats {
  const open = obligations.filter((o) => o.status === "open");

  return {
    total: obligations.length,
    open: open.length,
    relieved: obligations.filter((o) => o.status === "relieved").length,
    done: obligations.filter((o) => o.status === "done").length,
    ignored: obligations.filter((o) => o.status === "ignored").length,
    urgent: open.filter((o) => o.priorityScore >= 70).length,
    critical: open.filter((o) => o.consequence === "critical").length,
    avgScore:
      open.length > 0
        ? Math.round(open.reduce((sum, o) => sum + o.priorityScore, 0) / open.length)
        : 0,
    quickWins: open.filter((o) => o.reliefAction.effortMinutes <= 15).length,
  };
}
