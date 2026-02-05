"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";
import type { SeverityLevel, SeverityReason } from "@/lib/severity";

// Phase 2 Step 1: Extended obligation types to support dependency graph.
// New types: ACCEPTANCE, SCHOLARSHIP_DISBURSEMENT, ENROLLMENT.
// Existing types unchanged for backwards compatibility.
export type ObligationType =
  | "FAFSA"
  | "APPLICATION_FEE"
  | "APPLICATION_SUBMISSION"
  | "HOUSING_DEPOSIT"
  | "SCHOLARSHIP"
  | "ENROLLMENT_DEPOSIT"
  | "SCHOLARSHIP_ACCEPTANCE"
  | "ACCEPTANCE"
  | "SCHOLARSHIP_DISBURSEMENT"
  | "ENROLLMENT";

export type ObligationSource = "email" | "manual";

export type ObligationStatus = "pending" | "submitted" | "verified" | "blocked" | "failed";

// Phase 2 Step 1: Blocker info returned by dependency evaluation endpoint.
export interface ObligationBlocker {
  obligation_id: string;
  type: string;
  title: string;
  status: string;
  institution?: string | null;
  deadline?: string | null;
}

// Phase 2 Step 3: Override record. Immutable. Append-only.
// Represents a user's deliberate decision to bypass a specific dependency block.
// The system persists these permanently — no edits, no deletes.
//
// GUARDRAILS:
// - No bulk overrides. Each override is for one (obligation, dependency) pair.
// - No auto-overrides. The system never creates these on its own.
// - No AI-suggested overrides. Human decision only.
// - user_reason is required and non-empty.
export interface ObligationOverride {
  id: string;
  obligation_id: string;
  overridden_dependency_id: string;
  user_reason: string;
  created_at: string;
}

// Phase 2 Step 3: Overridden dependency info returned alongside blockers.
// These are dependencies that remain unverified but no longer block because
// the user explicitly overrode them with a reason.
export interface OverriddenDep {
  obligation_id: string;
  type: string;
  title: string;
  status: string;
  created_at?: string | null;
  institution?: string | null;
  deadline?: string | null;
}

export interface ObligationRow {
  id: string;
  user_id: string;
  type: ObligationType;
  title: string;
  source: ObligationSource;
  source_ref: string;
  deadline: string | null;
  status: ObligationStatus;
  proof_required: boolean;
  created_at: string;
  updated_at: string;
  failed_at?: string | null;
  verified_at?: string | null;
  prior_failed_obligation_id?: string | null;
  // Phase 2 Step 4: Stuck state. System-derived. Not user-editable.
  stuck?: boolean;
  stuck_reason?: StuckReason | null;
  stuck_since?: string | null;
  status_changed_at?: string;
  // Phase 3 Step 1: Severity. System-derived. Not user-editable.
  // Drives visual treatment (badges, row colors). Separate from escalation (behavioral).
  severity?: SeverityLevel;
  severity_since?: string | null;
  severity_reason?: SeverityReason | null;
}

// Phase 2 Step 4: Stuck reason taxonomy. Exact list. No additions.
// These describe WHY nothing is progressing — not what to do about it.
export type StuckReason =
  | "unmet_dependency"
  | "overridden_dependency"
  | "missing_proof"
  | "external_verification_pending"
  | "hard_deadline_passed";

// Phase 2 Step 4: Stuck info returned by the stuck detection endpoint.
// Includes the full chain trace for UI display.
// Phase 3 Step 1: Extended with severity fields.
export interface StuckInfo {
  obligation_id: string;
  stuck: boolean;
  stuck_reason: StuckReason | null;
  stuck_since: string | null;
  is_deadlocked: boolean;
  days_stale: number;
  chain: StuckChainLink[];
  // Phase 3 Step 1: Severity from the stuck detection endpoint
  severity?: SeverityLevel;
  severity_reason?: SeverityReason;
  severity_since?: string | null;
}

// Phase 2 Step 4: A single link in a dependency chain trace.
export interface StuckChainLink {
  obligation_id: string;
  type: string;
  title: string;
  status: string;
  is_cycle_back?: boolean;
}

export function useObligations() {
  const { user, loading: authLoading } = useAuth();
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createSupabaseBrowser();

  const fetchObligations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("obligations")
      .select("*")
      .eq("user_id", user.id)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setObligations([]);
    } else {
      setObligations((data as ObligationRow[]) || []);
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setObligations([]);
      setLoading(false);
      return;
    }
    fetchObligations();
  }, [authLoading, user, fetchObligations]);

  return { obligations, loading, error, refresh: fetchObligations };
}
