"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";

// ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
// `schools` may exist for grouping/context, but deadlines are canonical only in `obligations`.

type ObligationType =
  | "FAFSA"
  | "APPLICATION_FEE"
  | "APPLICATION_SUBMISSION"
  | "HOUSING_DEPOSIT"
  | "SCHOLARSHIP";

function buildSchoolDeadlineObligations(params: {
  userId: string;
  schoolId: string;
  schoolName: string;
  applicationDeadline?: string | null;
  financialAidDeadline?: string | null;
}) {
  const obligations: any[] = [];

  if (params.applicationDeadline) {
    obligations.push({
      user_id: params.userId,
      type: "APPLICATION_SUBMISSION" as ObligationType,
      title: `Submit application — ${params.schoolName}`,
      source: "manual",
      source_ref: `school:${params.schoolId}:application_deadline`,
      deadline: params.applicationDeadline,
      status: "pending",
      proof_required: false,
    });
  }

  if (params.financialAidDeadline) {
    obligations.push({
      user_id: params.userId,
      type: "FAFSA" as ObligationType,
      title: `Submit FAFSA — ${params.schoolName}`,
      source: "manual",
      source_ref: `school:${params.schoolId}:financial_aid_deadline`,
      deadline: params.financialAidDeadline,
      status: "pending",
      proof_required: true,
    });
  }

  return obligations;
}

export interface School {
  id: string;
  user_id: string;
  name: string;
  application_type: "undergraduate" | "graduate" | "transfer";
  application_deadline: string | null;
  financial_aid_deadline: string | null;
  status: "tracking" | "applied" | "accepted" | "enrolled" | "declined";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSchoolInput {
  name: string;
  application_type?: string;
  application_deadline?: string;
  financial_aid_deadline?: string;
  notes?: string;
}

export function useSchools() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const supabase = createSupabaseBrowser();

  const fetchSchools = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("schools")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setSchools(data || []);
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSchools([]);
      setLoading(false);
      return;
    }
    fetchSchools();
  }, [authLoading, user, fetchSchools]);

  const addSchool = async (input: CreateSchoolInput) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("schools")
      .insert({
        user_id: user.id,
        name: input.name,
        application_type: input.application_type || "undergraduate",
        // Phase 1 doctrine: do not store canonical deadlines on `schools`.
        application_deadline: null,
        financial_aid_deadline: null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    // Route any provided deadlines into canonical `obligations`.
    try {
      const obligations = buildSchoolDeadlineObligations({
        userId: user.id,
        schoolId: data.id,
        schoolName: data.name,
        applicationDeadline: input.application_deadline || null,
        financialAidDeadline: input.financial_aid_deadline || null,
      });
      if (obligations.length > 0) {
        await supabase.from("obligations").upsert(obligations, {
          onConflict: "user_id,source,source_ref",
        });
      }
    } catch (e) {
      console.error("Failed to route school deadlines -> obligations:", e);
    }

    setSchools((prev) => [data, ...prev]);
    return data;
  };

  const updateSchool = async (id: string, updates: Partial<School>) => {
    // Phase 1 doctrine: do not write deadlines on `schools` (route to obligations instead).
    const { application_deadline, financial_aid_deadline, ...rest } = updates as any;
    const { error } = await supabase.from("schools").update(rest).eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }

    try {
      const school = schools.find((s) => s.id === id);
      if (school) {
        const obligations = buildSchoolDeadlineObligations({
          userId: school.user_id,
          schoolId: school.id,
          schoolName: school.name,
          applicationDeadline: application_deadline || null,
          financialAidDeadline: financial_aid_deadline || null,
        });
        if (obligations.length > 0) {
          await supabase.from("obligations").upsert(obligations, {
            onConflict: "user_id,source,source_ref",
          });
        }
      }
    } catch (e) {
      console.error("Failed to route updated school deadlines -> obligations:", e);
    }

    setSchools((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    return true;
  };

  const deleteSchool = async (id: string) => {
    const { error } = await supabase.from("schools").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    setSchools((prev) => prev.filter((s) => s.id !== id));
    return true;
  };

  return { schools, loading, error, addSchool, updateSchool, deleteSchool, refresh: fetchSchools };
}
