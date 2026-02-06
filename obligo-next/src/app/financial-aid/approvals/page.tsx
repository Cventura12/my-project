"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useFollowUps, FollowUp } from "@/lib/hooks/useFollowUps";
import EmailDraftModal from "@/components/financial-aid/EmailDraftModal";
import CriticalOblBar from "@/components/financial-aid/CriticalOblBar";
import LegacyBanner from "@/components/financial-aid/LegacyBanner";
import {
  ArrowLeft,
  FileEdit,
  Send,
  Clock,
  Ban,
  CheckCircle2,
} from "lucide-react";

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  pending_approval: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50", label: "Pending" },
  sent: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Sent" },
  cancelled: { icon: Ban, color: "text-gray-400", bg: "bg-gray-50", label: "Cancelled" },
};

type FilterMode = "pending" | "sent" | "all";

export default function ApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    drafts,
    pendingDrafts,
    sentDrafts,
    loading,
    improveDraft,
    sendDraft,
    cancelDraft,
  } = useFollowUps();
  const router = useRouter();
  const [selectedDraft, setSelectedDraft] = useState<FollowUp | null>(null);
  const [filter, setFilter] = useState<FilterMode>("pending");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const filtered = filter === "pending"
    ? pendingDrafts
    : filter === "sent"
    ? sentDrafts
    : drafts;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F0FDF4]">
      {/* Header */}
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/financial-aid")}
              className="w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-black">Email Approvals</h1>
              <p className="text-xs text-gray-400">Review and send AI-drafted emails</p>
            </div>
          </div>
        </div>
      </header>

      <LegacyBanner />

      {/* Phase 3 Step 2: Cross-context visibility. */}
      <CriticalOblBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setFilter("pending")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === "pending" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Pending ({pendingDrafts.length})
          </button>
          <button
            onClick={() => setFilter("sent")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === "sent" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Sent ({sentDrafts.length})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === "all" ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            All ({drafts.length})
          </button>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <FileEdit className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {filter === "pending"
                ? "No drafts pending approval."
                : filter === "sent"
                ? "No emails sent yet."
                : "No drafts created yet."}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Open a document and click &quot;Draft Follow-up&quot; to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((draft) => {
              const config = statusConfig[draft.status] || statusConfig.pending_approval;
              const StatusIcon = config.icon;
              const schoolName = draft.metadata?.school_name || "School";
              const documentName = draft.metadata?.document_name;

              return (
                <button
                  key={draft.id}
                  onClick={() => draft.status === "pending_approval" && setSelectedDraft(draft)}
                  disabled={draft.status !== "pending_approval"}
                  className={`w-full bg-white border-2 border-black rounded-xl p-4 text-left transition-colors ${
                    draft.status === "pending_approval" ? "hover:bg-gray-50 cursor-pointer" : "opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-black truncate">
                          {draft.subject || "Email Draft"}
                        </h3>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {schoolName}
                        {documentName && ` · ${documentName}`}
                        {" · "}
                        {new Date(draft.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                        {draft.edited_content || draft.drafted_content}
                      </p>
                    </div>
                    <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                      <StatusIcon className={`w-4 h-4 ${config.color}`} />
                    </div>
                  </div>
                  {draft.sent_at && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      Sent {new Date(draft.sent_at).toLocaleString()}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Draft modal */}
      {selectedDraft && (
        <EmailDraftModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onSend={sendDraft}
          onImprove={improveDraft}
          onCancel={cancelDraft}
        />
      )}
    </div>
  );
}
