export type UISeverity = "normal" | "elevated" | "high" | "critical" | "failed";

export interface UIObligationSummary {
  id: string;
  title: string;
  type: string;
  schoolName: string;
  deadline: Date | null;
  status: string;
  severity: UISeverity;
  proofRequired: boolean;
  proofCount: number;
  isBlocked: boolean;
  blockedBySummary: string;
  stuck: boolean;
  reasonLine: string;
}

export interface UIObligationDetail extends UIObligationSummary {
  source?: string;
  sourceRef?: string;
  blockers?: Array<{ type: string; title: string; status: string }>;
  overrides?: Array<{ type: string; title: string; status: string; created_at?: string | null }>;
  steps?: Array<{ step_type: string; status: string; created_at?: string }>;
}

export interface UISignal {
  id: string;
  sourceType: "email" | "intake";
  subject: string;
  from: string;
  school: string;
  deadline: string | null;
  confidence?: number | null;
  category?: string | null;
  requiresAction?: boolean;
  createdAt?: string;
}

export interface UIApprovalDraft {
  id: string;
  subject: string;
  recipient: string;
  status: string;
  schoolName?: string;
  documentName?: string;
  createdAt?: string;
}
