"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";

// Phase 2 Step 1: Extended obligation types to support dependency graph.
// New types: ACCEPTANCE, SCHOLARSHIP_DISBURSEMENT, ENROLLMENT.
// Existing types unchanged for backwards compatibility.
export type ObligationType =
  | "FAFSA"
  | "APPLICATION_FEE"
  | "APPLICATION_SUBMISSION"
  | "HOUSING_DEPOSIT"
  | "SCHOLARSHIP"
  | "ACCEPTANCE"
  | "SCHOLARSHIP_DISBURSEMENT"
  | "ENROLLMENT";

export type ObligationSource = "email" | "manual";

export type ObligationStatus = "pending" | "submitted" | "verified" | "blocked";

// Phase 2 Step 1: Blocker info returned by dependency evaluation endpoint.
export interface ObligationBlocker {
  obligation_id: string;
  type: string;
  title: string;
  status: string;
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

