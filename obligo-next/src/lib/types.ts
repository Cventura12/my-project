/**
 * TypeScript Types for Obligo
 *
 * Centralized type definitions ensure type safety across the entire application.
 * This file exports interfaces that describe the shape of our data.
 */

/**
 * Priority levels for tasks/obligations
 * - urgent: Needs immediate attention (red)
 * - blocking: Blocking others or blocked by deadline (orange/amber)
 * - normal: Standard priority (blue)
 */
export type Priority = "urgent" | "blocking" | "normal";

/**
 * Obligation type based on keyword classification
 */
export type ObligationType = "assignment" | "response" | "application" | "unknown";

/**
 * Main Obligation/Task interface
 * Represents a single obligation that needs user attention
 */
export interface Obligation {
  /** Unique identifier */
  id: string;
  /** Short, descriptive title */
  title: string;
  /** Human-readable due date (e.g., "2d", "Tomorrow", "Jan 25") */
  dueDate: string;
  /** Source or context (e.g., "Client - ABC Corp", "Prof. Smith") */
  context: string;
  /** Priority level determines visual styling */
  priority: Priority;
  /** AI-generated suggested next action */
  quickAction: string;
  /** Explanation of consequences/importance */
  whyItMatters: string;
  /** Numeric score 0-100, higher = more urgent */
  priorityScore: number;
  /** Whether the task has been completed */
  completed: boolean;
  /** Link to the source email/task (Gmail, Outlook, etc.) */
  sourceLink?: string;
  /** Type of obligation (assignment, response, application, unknown) */
  type?: ObligationType;
  /** Step-by-step action path to help student get started */
  actionPath?: string[];
}

/**
 * Statistics derived from the obligations list
 */
export interface ObligationStats {
  total: number;
  urgent: number;
  blocking: number;
  avgScore: number;
}

/**
 * Props types for components
 */
export interface HeaderProps {
  lastUpdated?: Date | null;
}

export interface ActionButtonsProps {
  onRefresh: () => void;
  onTriggerCheck: () => void;
  onExport: () => void;
  isLoading?: boolean;
}

export interface StatsBarProps {
  stats: ObligationStats;
}

export interface TaskCardProps {
  obligation: Obligation;
  onComplete: (id: string) => void;
}

export interface TaskListProps {
  obligations: Obligation[];
  onComplete: (id: string) => void;
}
