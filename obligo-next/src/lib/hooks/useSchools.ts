"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";

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
        application_deadline: input.application_deadline || null,
        financial_aid_deadline: input.financial_aid_deadline || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }
    setSchools((prev) => [data, ...prev]);
    return data;
  };

  const updateSchool = async (id: string, updates: Partial<School>) => {
    const { error } = await supabase.from("schools").update(updates).eq("id", id);
    if (error) {
      setError(error.message);
      return false;
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
