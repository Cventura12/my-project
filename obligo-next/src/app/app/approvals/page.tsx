"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorState, MetaText, PageTitle, Skeleton } from "@/components/ui/Page";
import ApprovalsQueue from "@/components/v2/approvals/ApprovalsQueue";
import EmailDraftModal from "@/components/financial-aid/EmailDraftModal";
import { listDrafts, improveDraft, sendDraft, cancelDraft } from "@/api/approvals";
import { useAuth } from "@/lib/supabase/auth-provider";

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
      const list = res?.drafts || res?.data || res || [];
      setDrafts(list);
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
      <div className="space-y-1">
        <PageTitle>Approvals</PageTitle>
        <MetaText>Review and approve outbound follow-ups before they’re sent.</MetaText>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(user.id)} />
      ) : pending.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center">
          <h3 className="text-sm font-semibold text-gray-800">Nothing to approve</h3>
          <p className="text-xs text-gray-500 mt-1">
            You’re all caught up. Obligo will queue follow-ups when confirmation is missing.
          </p>
        </div>
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
