"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, SectionHeader, Skeleton } from "@/components/ui/Page";
import ApprovalsQueue from "@/components/v2/approvals/ApprovalsQueue";
import EmailDraftModal from "@/components/financial-aid/EmailDraftModal";
import { listDrafts, improveDraft, sendDraft, cancelDraft } from "@/api/approvals";
import { useAuth } from "@/lib/supabase/auth-provider";
import { NAV_LABELS, EMPTY_STATES } from "@/lib/copy";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const load = async (currentUserId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDrafts(currentUserId);
      setDrafts(res.drafts ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      if (!alive) return;
      await load(user.id);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const pending = useMemo(
    () => drafts.filter((d) => d.status === "pending_approval" || d.status === "draft"),
    [drafts]
  );

  const handleSend = async (draftId: string, editedContent: string, editedSubject: string) => {
    if (!user) return false;
    try {
      await sendDraft({
        user_id: user.id,
        follow_up_id: draftId,
        edited_content: editedContent,
        edited_subject: editedSubject,
      });
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, status: "sent" } : d))
      );
      return true;
    } catch (e: any) {
      setError(e?.message || "Send failed");
      return false;
    }
  };

  const handleCancel = async (draftId: string) => {
    if (!user) return false;
    try {
      await cancelDraft({ user_id: user.id, follow_up_id: draftId });
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, status: "cancelled" } : d))
      );
      return true;
    } catch (e: any) {
      setError(e?.message || "Cancel failed");
      return false;
    }
  };

  const handleImprove = async (draftId: string, feedback: string) => {
    if (!user) return null;
    try {
      const res = await improveDraft({ user_id: user.id, follow_up_id: draftId, feedback });
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, edited_content: res.content } : d))
      );
      return res.content;
    } catch (e: any) {
      setError(e?.message || "Improve failed");
      return null;
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={NAV_LABELS.approvals}
        subtitle="Review and approve outbound follow-ups before they are sent."
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(user.id)} />
      ) : pending.length === 0 ? (
        <EmptyState>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{EMPTY_STATES.approvals}</p>
        </EmptyState>
      ) : (
        <ApprovalsQueue drafts={pending} onOpen={(draft) => setSelected(draft)} />
      )}

      {selected && (
        <EmailDraftModal
          draft={selected}
          onClose={() => setSelected(null)}
          onImprove={(id, feedback) => handleImprove(id, feedback)}
          onSend={(id, editedContent, editedSubject) => handleSend(id, editedContent, editedSubject)}
          onCancel={(id) => handleCancel(id)}
        />
      )}
    </div>
  );
}
