"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/supabase/auth-provider";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface FollowUp {
  id: string;
  user_id: string;
  school_id: string;
  document_id: string | null;
  follow_up_type: "email_draft" | "status_inquiry";
  status: "pending_approval" | "approved" | "sent" | "cancelled";
  drafted_content: string;
  edited_content: string | null;
  subject: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  sent_message_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useFollowUps() {
  const { user, loading: authLoading } = useAuth();
  const [drafts, setDrafts] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("follow_ups")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDrafts(data as FollowUp[]);
    }
    setLoading(false);
  }, [user]);

  // Create a new draft
  const createDraft = useCallback(
    async (
      schoolId: string,
      draftType: string = "follow_up",
      documentId?: string,
      inquiryType?: string
    ): Promise<FollowUp | null> => {
      if (!user) return null;
      setCreating(true);
      try {
        const res = await fetch(`${API_BASE}/api/draft/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            school_id: schoolId,
            document_id: documentId || null,
            draft_type: draftType,
            inquiry_type: inquiryType || "general",
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Failed to create draft");
        }
        const data = await res.json();
        if (data.follow_up) {
          setDrafts((prev) => [data.follow_up, ...prev]);
        }
        return data.follow_up || null;
      } catch (e) {
        console.error("Create draft error:", e);
        return null;
      } finally {
        setCreating(false);
      }
    },
    [user]
  );

  // Improve a draft with AI
  const improveDraft = useCallback(
    async (followUpId: string, feedback: string): Promise<string | null> => {
      if (!user) return null;
      try {
        const res = await fetch(`${API_BASE}/api/draft/improve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            follow_up_id: followUpId,
            feedback,
          }),
        });
        if (!res.ok) throw new Error("Improve failed");
        const data = await res.json();
        // Update local state
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === followUpId ? { ...d, edited_content: data.content } : d
          )
        );
        return data.content;
      } catch (e) {
        console.error("Improve draft error:", e);
        return null;
      }
    },
    [user]
  );

  // Send (approve & send) a draft
  const sendDraft = useCallback(
    async (
      followUpId: string,
      editedContent?: string,
      editedSubject?: string
    ): Promise<boolean> => {
      if (!user) return false;
      try {
        const res = await fetch(`${API_BASE}/api/draft/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            follow_up_id: followUpId,
            edited_content: editedContent || null,
            edited_subject: editedSubject || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Send failed");
        }
        setDrafts((prev) =>
          prev.map((d) => (d.id === followUpId ? { ...d, status: "sent" as const } : d))
        );
        return true;
      } catch (e) {
        console.error("Send draft error:", e);
        return false;
      }
    },
    [user]
  );

  // Cancel a draft
  const cancelDraft = useCallback(
    async (followUpId: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const res = await fetch(`${API_BASE}/api/draft/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id, follow_up_id: followUpId }),
        });
        if (!res.ok) throw new Error("Cancel failed");
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === followUpId ? { ...d, status: "cancelled" as const } : d
          )
        );
        return true;
      } catch (e) {
        console.error("Cancel draft error:", e);
        return false;
      }
    },
    [user]
  );

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    fetchDrafts();
  }, [authLoading, user, fetchDrafts]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel("follow_ups_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follow_ups",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchDrafts(); // Refetch on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchDrafts]);

  const pendingDrafts = drafts.filter((d) => d.status === "pending_approval");
  const sentDrafts = drafts.filter((d) => d.status === "sent");

  return {
    drafts,
    pendingDrafts,
    sentDrafts,
    loading,
    creating,
    createDraft,
    improveDraft,
    sendDraft,
    cancelDraft,
    refetch: fetchDrafts,
  };
}
