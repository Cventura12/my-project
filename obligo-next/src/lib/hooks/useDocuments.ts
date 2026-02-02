"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";

export interface Document {
  id: string;
  school_id: string;
  user_id: string;
  name: string;
  type: "form" | "tax" | "transcript" | "letter" | "id" | "financial" | "other";
  description: string | null;
  deadline: string | null;
  status: "not_started" | "in_progress" | "submitted" | "received" | "verified" | "issue";
  submission_method: string | null;
  submitted_at: string | null;
  received_at: string | null;
  file_url: string | null;
  notes: string | null;
  is_urgent: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentInput {
  school_id: string;
  name: string;
  type?: string;
  description?: string;
  deadline?: string;
  submission_method?: string;
}

export function useDocuments(schoolId?: string) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const supabase = createSupabaseBrowser();

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("deadline", { ascending: true, nullsFirst: false });

    if (schoolId) {
      query = query.eq("school_id", schoolId);
    }

    const { data, error } = await query;
    if (error) {
      setError(error.message);
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  }, [user, schoolId, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    fetchDocuments();
  }, [authLoading, user, fetchDocuments]);

  const addDocument = async (input: CreateDocumentInput) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("documents")
      .insert({
        school_id: input.school_id,
        user_id: user.id,
        name: input.name,
        type: input.type || "other",
        description: input.description || null,
        deadline: input.deadline || null,
        submission_method: input.submission_method || null,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }
    setDocuments((prev) => [...prev, data]);
    return data;
  };

  const updateDocumentStatus = async (
    id: string,
    status: Document["status"],
    extra?: { submitted_at?: string; received_at?: string; notes?: string }
  ) => {
    const updates: any = { status, ...extra };
    if (status === "submitted" && !updates.submitted_at) {
      updates.submitted_at = new Date().toISOString();
    }
    if (status === "received" && !updates.received_at) {
      updates.received_at = new Date().toISOString();
    }

    const { error } = await supabase.from("documents").update(updates).eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    return true;
  };

  const deleteDocument = async (id: string) => {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    return true;
  };

  return { documents, loading, error, addDocument, updateDocumentStatus, deleteDocument, refresh: fetchDocuments };
}
