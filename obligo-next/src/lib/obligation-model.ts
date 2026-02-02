/**
 * Obligo Core Data Model
 *
 * This model captures the psychological weight of obligations, not just task metadata.
 * Every field answers a critical question about WHY this item demands attention.
 *
 * Day 1 Sprint Lock - v1.0
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Who is psychologically "waiting" for this obligation to be fulfilled?
 * - person: A specific individual (boss, professor, client)
 * - group: Multiple people or an organization (team, committee, company)
 * - self: Future you is affected (health, finances, goals)
 * - unknown: Source unclear but pressure exists (vague guilt, floating anxiety)
 */
export type WhoIsWaiting = "person" | "group" | "self" | "unknown";

/**
 * How did this obligation come into existence?
 * - request: Someone explicitly asked you to do something
 * - promise: You committed to deliver something
 * - deadline: External date creates the obligation (tax day, enrollment)
 * - expectation: Unspoken but understood responsibility (reply to emails)
 */
export type ObligationOrigin = "request" | "promise" | "deadline" | "expectation";

/**
 * What is the realistic fallout if this obligation is ignored?
 * - low: Minor inconvenience, easily recoverable
 * - medium: Noticeable damage, requires effort to repair
 * - high: Significant harm, may be irreversible
 * - critical: Catastrophic, life-altering consequences
 */
export type ConsequenceLevel = "low" | "medium" | "high" | "critical";

/**
 * What type of action relieves the pressure?
 * - communicate: Send a message, reply, update someone
 * - clarify: Ask questions, gather info, reduce ambiguity
 * - work: Actual execution/creation work
 * - schedule: Block time, set meeting, create commitment
 * - delegate: Hand off to someone else
 */
export type ReliefActionType = "communicate" | "clarify" | "work" | "schedule" | "delegate";

/**
 * Current state of the obligation
 * - open: Active, needs attention
 * - relieved: Pressure reduced but not complete (sent holding reply, etc.)
 * - done: Fully completed
 * - ignored: Consciously deprioritized (with acceptance of consequences)
 */
export type ObligationStatus = "open" | "relieved" | "done" | "ignored";

// ============================================================================
// RELIEF ACTION
// ============================================================================

/**
 * The smallest action that meaningfully reduces pressure.
 * NOT "finish the task" - the ONE thing you can do in 5-30 minutes
 * that makes this obligation feel less urgent.
 */
export interface ReliefAction {
  /** Short, actionable label (verb first) - e.g., "Send holding reply" */
  label: string;

  /** Realistic time in minutes (5-30 ideally, max 60) */
  effortMinutes: number;

  /** Category of action */
  type: ReliefActionType;

  /** Optional: Pre-drafted content for communicate actions */
  draftContent?: string;
}

// ============================================================================
// MAIN OBLIGATION INTERFACE
// ============================================================================

/**
 * Core Obligation Model
 *
 * Answers 5 critical questions:
 * 1. WHO is waiting? (whoIsWaiting + waitingParty)
 * 2. WHY does it exist? (origin)
 * 3. WHAT happens if ignored? (consequence + consequenceNote)
 * 4. WHEN does pressure increase? (pressureDate + dueDate)
 * 5. WHAT relieves the pressure? (reliefAction)
 */
export interface Obligation {
  /** Unique identifier (uuid or nanoid) */
  id: string;

  /** Short, descriptive title (max ~60 chars) */
  title: string;

  // -------------------------------------------------------------------------
  // WHO is waiting?
  // -------------------------------------------------------------------------

  /** Category of who is affected by this obligation */
  whoIsWaiting: WhoIsWaiting;

  /** Human-readable label for who's waiting
   *  Examples: "Prof. Smith", "Client - ABC Corp", "Future me", "Team"
   */
  waitingParty: string;

  // -------------------------------------------------------------------------
  // WHY does it exist?
  // -------------------------------------------------------------------------

  /** How this obligation came to be */
  origin: ObligationOrigin;

  /** Optional: Where/when did this originate? (email subject, meeting, etc.) */
  sourceRef?: string;

  // -------------------------------------------------------------------------
  // WHAT happens if ignored?
  // -------------------------------------------------------------------------

  /** Severity of consequences */
  consequence: ConsequenceLevel;

  /** Specific, personal description of what happens
   *  BAD: "Bad things will happen"
   *  GOOD: "Grade drops from A to B, affects grad school apps"
   */
  consequenceNote: string;

  // -------------------------------------------------------------------------
  // WHEN does pressure increase?
  // -------------------------------------------------------------------------

  /** When does this start feeling urgent? (often before due date)
   *  This is when the obligation enters "hot zone" - not when it's due,
   *  but when ignoring it starts causing anxiety/problems.
   */
  pressureDate: string; // ISO 8601 date string

  /** Hard deadline (if one exists). Null = no fixed due date */
  dueDate: string | null; // ISO 8601 date string

  // -------------------------------------------------------------------------
  // WHAT is the relief action?
  // -------------------------------------------------------------------------

  /** The smallest step that meaningfully reduces pressure */
  reliefAction: ReliefAction;

  // -------------------------------------------------------------------------
  // STATUS & METADATA
  // -------------------------------------------------------------------------

  /** Current state */
  status: ObligationStatus;

  /** Computed priority score (0-100, higher = more urgent) */
  priorityScore: number;

  /** When was this obligation created */
  createdAt: string; // ISO 8601

  /** When was this last updated */
  updatedAt: string; // ISO 8601

  /** Optional: Notes, context, or history */
  notes?: string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/** Input type for creating new obligations (without computed fields) */
export type CreateObligationInput = Omit<
  Obligation,
  "id" | "priorityScore" | "createdAt" | "updatedAt"
>;

/** Partial update type */
export type UpdateObligationInput = Partial<CreateObligationInput>;

// ============================================================================
// EXAMPLE OBLIGATIONS
// ============================================================================

/**
 * Example 1: Academic/Student Obligation
 * High stakes, specific person waiting, near-term pressure
 */
export const exampleAcademic: Obligation = {
  id: "obl_acad_001",
  title: "Respond to professor about assignment extension",

  whoIsWaiting: "person",
  waitingParty: "Prof. Smith",

  origin: "request",
  sourceRef: "Email received Jan 20, 2026",

  consequence: "high",
  consequenceNote: "Grade drops from A to B if late; affects grad school applications",

  pressureDate: "2026-01-22T00:00:00Z", // Today - already in hot zone
  dueDate: "2026-01-23T17:00:00Z",      // Tomorrow 5pm

  reliefAction: {
    label: "Send brief clarification email",
    effortMinutes: 10,
    type: "communicate",
    draftContent: "Dear Prof. Smith,\n\nThank you for your email. I wanted to clarify the scope of the extension request. Specifically, I'm asking for..."
  },

  status: "open",
  priorityScore: 85,

  createdAt: "2026-01-20T14:30:00Z",
  updatedAt: "2026-01-22T08:00:00Z",
};

/**
 * Example 2: Professional/Work Obligation
 * Client waiting, blocking project progress
 */
export const exampleProfessional: Obligation = {
  id: "obl_work_001",
  title: "Complete project proposal for client meeting",

  whoIsWaiting: "group",
  waitingParty: "Client - ABC Corp",

  origin: "promise",
  sourceRef: "Committed in kickoff meeting Jan 15",

  consequence: "high",
  consequenceNote: "Project start delayed by 2+ weeks; client may question our reliability",

  pressureDate: "2026-01-23T00:00:00Z", // Tomorrow - entering hot zone
  dueDate: "2026-01-24T09:00:00Z",      // Meeting in 2 days

  reliefAction: {
    label: "Open draft and add final pricing section",
    effortMinutes: 25,
    type: "work",
  },

  status: "open",
  priorityScore: 78,

  createdAt: "2026-01-15T16:00:00Z",
  updatedAt: "2026-01-22T08:00:00Z",
};

/**
 * Example 3: Personal/Self Obligation
 * Future self affected, deadline-driven
 */
export const examplePersonal: Obligation = {
  id: "obl_self_001",
  title: "File FAFSA for financial aid",

  whoIsWaiting: "self",
  waitingParty: "Future me",

  origin: "deadline",
  sourceRef: "Federal deadline March 1, 2026",

  consequence: "critical",
  consequenceNote: "Miss $15,000+ in financial aid; may not afford next semester",

  pressureDate: "2026-01-29T00:00:00Z", // 1 week out - start gathering docs
  dueDate: "2026-03-01T23:59:00Z",      // Federal deadline

  reliefAction: {
    label: "Gather 2025 tax documents from parents",
    effortMinutes: 15,
    type: "clarify",
  },

  status: "open",
  priorityScore: 62,

  createdAt: "2026-01-10T10:00:00Z",
  updatedAt: "2026-01-22T08:00:00Z",
};

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * PRIORITY SCORE CALCULATION (0-100)
 *
 * Factors and approximate weights:
 * 1. Time pressure (40%):
 *    - Days until pressureDate (not dueDate!)
 *    - Score increases rapidly as pressure date approaches
 *    - Formula: max(0, 40 - (daysUntilPressure * 5))
 *
 * 2. Consequence severity (30%):
 *    - critical: 30, high: 22, medium: 15, low: 8
 *
 * 3. Who is waiting (15%):
 *    - person: 15 (someone specific = high social pressure)
 *    - group: 12 (collective expectations)
 *    - self: 8 (easier to rationalize)
 *    - unknown: 5 (vague anxiety)
 *
 * 4. Origin type (10%):
 *    - promise: 10 (you committed)
 *    - request: 8 (someone asked)
 *    - deadline: 7 (external)
 *    - expectation: 5 (implied)
 *
 * 5. Effort to relieve (5%):
 *    - <10 min: 5 (quick win!)
 *    - 10-30 min: 3
 *    - >30 min: 1
 */

/**
 * PRESSURE DATE HEURISTICS
 *
 * If no explicit pressure date, calculate from due date:
 * - critical consequence: pressureDate = dueDate - 14 days
 * - high consequence: pressureDate = dueDate - 7 days
 * - medium consequence: pressureDate = dueDate - 3 days
 * - low consequence: pressureDate = dueDate - 1 day
 *
 * If no due date exists:
 * - Use creation date + consequence-based offset
 * - Show "no deadline" but still apply pressure based on age
 */

/**
 * VALIDATION RULES
 *
 * 1. title: Required, 1-100 characters
 * 2. waitingParty: Required, 1-50 characters
 * 3. consequenceNote: Required, 10-200 characters (must be specific!)
 * 4. reliefAction.label: Must start with a verb
 * 5. reliefAction.effortMinutes: 1-60 (if >60, break it down)
 * 6. pressureDate: Must be <= dueDate (if dueDate exists)
 * 7. dueDate: Optional, but recommended for scoring accuracy
 */
