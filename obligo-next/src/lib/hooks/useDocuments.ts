"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-provider";

// ⚠️ NON-AUTHORITATIVE (PHASE 1 DOCTRINE)
// `documents` is legacy/UX-only. It must not be used as a deadline ledger.
// Canonical work items + deadlines live in `obligations`.

// Phase 2 Step 1: Extended types to match dependency graph nodes.
type ObligationType =
  | "FAFSA"
  | "APPLICATION_FEE"
  | "APPLICATION_SUBMISSION"
  | "HOUSING_DEPOSIT"
  | "SCHOLARSHIP"
  | "ACCEPTANCE"
  | "SCHOLARSHIP_DISBURSEMENT"
  | "ENROLLMENT";

type ObligationStatus = "pending" | "submitted" | "verified" | "blocked";

function classifyObligationTypeFromTitle(title: string): ObligationType {
  const t = (title || "").toLowerCase();
  if (t.includes("fafsa")) return "FAFSA";
  if (t.includes("acceptance") || t.includes("admitted") || t.includes("accepted")) return "ACCEPTANCE";
  if (t.includes("enrollment") || t.includes("enroll")) return "ENROLLMENT";
  if (t.includes("scholarship") && t.includes("disbursement")) return "SCHOLARSHIP_DISBURSEMENT";
  if (t.includes("scholarship") || t.includes("grant")) return "SCHOLARSHIP";
  if ((t.includes("housing") && t.includes("deposit")) || t.includes("housing deposit")) return "HOUSING_DEPOSIT";
  if ((t.includes("application") && t.includes("fee")) || t.includes("application fee")) return "APPLICATION_FEE";
  return "APPLICATION_SUBMISSION";
}

function proofRequiredForType(type: ObligationType): boolean {
  return type === "FAFSA" || type === "APPLICATION_FEE" || type === "HOUSING_DEPOSIT" || type === "ENROLLMENT";
}

function mapDocumentStatusToObligationStatus(status: Document["status"]): ObligationStatus {
  if (status === "issue") return "blocked";
  if (status === "submitted" || status === "received" || status === "verified") return "submitted";
  return "pending";
}

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
      .order("created_at", { ascending: false });

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
        // Phase 1 doctrine: do not store canonical deadlines on `documents`.
        deadline: null,
        submission_method: input.submission_method || null,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    // Route into canonical `obligations`.
    try {
      const title = input.name.trim().toLowerCase().startsWith("submit ")
        ? input.name.trim()
        : `Submit ${input.name.trim()}`;
      const obligationType = classifyObligationTypeFromTitle(title);
      const obligationRow: any = {
        user_id: user.id,
        type: obligationType,
        title,
        source: "manual",
        source_ref: `document:${data.id}`,
        status: "pending",
        proof_required: proofRequiredForType(obligationType),
      };
      if (input.deadline) {
        obligationRow.deadline = input.deadline;
      }
      await supabase.from("obligations").upsert(obligationRow, {
        onConflict: "user_id,source,source_ref",
      });
    } catch (e: any) {
      console.error("Failed to route document -> obligation:", e);
      setError(e?.message || "Failed to create linked obligation");
    }

    setDocuments((prev) => [...prev, data]);
    return data;
  };

  const updateDocumentStatus = async (
    id: string,
    status: Document["status"],
    extra?: { submitted_at?: string; received_at?: string; notes?: string }
  ) => {
    // Phase 1 Step 3 (Authority): documents are NON-AUTHORITATIVE. Do not allow users to
    // mark "received"/"verified" without proof. Verification is proof-gated on canonical `obligations`.
    const current = documents.find((d) => d.id === id);
    if ((status === "received" || status === "verified") && current?.status !== status) {
      setError("Blocked: documents cannot be marked received/verified without proof. Attach proof to the linked obligation and verify there.");
      return false;
    }

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

    // Best-effort: keep canonical obligation status in sync.
    try {
      const existing = documents.find((d) => d.id === id);
      const title = existing?.name
        ? (existing.name.trim().toLowerCase().startsWith("submit ")
          ? existing.name.trim()
          : `Submit ${existing.name.trim()}`)
        : "Submit document";
      const obligationType = classifyObligationTypeFromTitle(title);
      await supabase.from("obligations").upsert(
        {
          user_id: user?.id,
          type: obligationType,
          title,
          source: "manual",
          source_ref: `document:${id}`,
          status: mapDocumentStatusToObligationStatus(status),
          proof_required: proofRequiredForType(obligationType),
        },
        { onConflict: "user_id,source,source_ref" }
      );
    } catch (e) {
      console.error("Failed to sync obligation status:", e);
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

    // Best-effort: delete the linked canonical obligation as well.
    try {
      await supabase
        .from("obligations")
        .delete()
        .eq("user_id", user?.id)
        .eq("source", "manual")
        .eq("source_ref", `document:${id}`);
    } catch (e) {
      console.error("Failed to delete linked obligation:", e);
    }

    setDocuments((prev) => prev.filter((d) => d.id !== id));
    return true;
  };

  return { documents, loading, error, addDocument, updateDocumentStatus, deleteDocument, refresh: fetchDocuments };
}
