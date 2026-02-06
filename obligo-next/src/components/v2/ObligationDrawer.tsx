"use client";

import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/Drawer";
import { ErrorState, Skeleton } from "@/components/ui/Page";
import { getDependencies, getObligations, getProofMissing, getSteps, getStuckDetection } from "@/api/obligations";
import { listDrafts, improveDraft, sendDraft, cancelDraft } from "@/api/approvals";
import { toUIObligationSummary } from "@/adapters/obligationAdapter";
import { UIObligationDetail } from "@/types/ui";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import EmailDraftModal from "@/components/financial-aid/EmailDraftModal";

type DrawerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: UIObligationDetail; proofs: any[]; drafts: any[]; blockers: any[]; stuckInfo?: any };

function formatDate(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dt;
  }
}

function daysUntil(dt?: string | null) {
  if (!dt) return null;
  const now = new Date();
  const target = new Date(dt);
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function ObligationDrawer({
  userId,
  obligationId,
  onClose,
}: {
  userId: string | null;
  obligationId: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<DrawerState>({ status: "idle" });
  const [selectedDraft, setSelectedDraft] = useState<any | null>(null);

  const load = async () => {
    if (!userId || !obligationId) {
      setState({ status: "idle" });
      return;
    }

    try {
      setState({ status: "loading" });
      const [obls, deps, stuck, proofsMissing, steps, drafts] = await Promise.all([
        getObligations(userId),
        getDependencies(userId),
        getStuckDetection(userId),
        getProofMissing(userId),
        getSteps(obligationId, userId),
        listDrafts(userId),
      ]);

      const obligation = (obls.obligations || []).find((o: any) => o.id === obligationId);
      if (!obligation) throw new Error("Obligation not found");

      const blockedBy = obligation.blocked_by || [];
      const summary = toUIObligationSummary({
        obligation,
        schoolName: "Unknown school",
        proofs: [],
        blockedBy,
      });

      const stuckInfo = (stuck.obligations || []).find((o: any) => o.id === obligationId);
      const supabase = createSupabaseBrowser();
      const proofRes = await supabase
        .from("obligation_proofs")
        .select("*")
        .eq("obligation_id", obligationId);
      const proofs = proofRes.data || [];

      const detail: UIObligationDetail = {
        ...summary,
        source: obligation.source,
        sourceRef: obligation.source_ref,
        blockers: blockedBy,
        overrides: obligation.overridden_deps || [],
        steps: steps.steps || [],
        stuck: !!(stuckInfo?.stuck ?? summary.stuck),
        reasonLine: summary.reasonLine,
        proofCount: proofs.length,
      };

      const draftList = (drafts.drafts ?? []).filter((d: any) => d.obligation_id === obligationId);

      setState({
        status: "ready",
        detail,
        proofs,
        drafts: draftList,
        blockers: blockedBy,
        stuckInfo,
      });
    } catch (e: any) {
      setState({ status: "error", message: e?.message || "Failed to load obligation" });
    }
  };

  useEffect(() => {
    if (!userId || !obligationId) {
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [userId, obligationId]);

  const drawerOpen = !!obligationId;

  const content = useMemo(() => {
    if (state.status === "loading") {
      return (
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    if (state.status === "error") {
      return <ErrorState message={state.message} onRetry={load} />;
    }
    if (state.status !== "ready") {
      return <p className="text-sm text-gray-500">Select an obligation.</p>;
    }

    const { detail, proofs, drafts, blockers, stuckInfo } = state;
    const dueIn = daysUntil(detail.deadline ? detail.deadline.toISOString() : null);
    const dueLine = detail.deadline
      ? `Due ${detail.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "No deadline";

    const addProof = async () => {
      if (!detail.id || !userId) return;
      const type = (prompt("Proof type (receipt | portal_screenshot | file_upload):", "receipt") || "").trim();
      const sourceRef = (prompt("Proof reference (file URL or short note):") || "").trim();
      if (!type || !sourceRef) return;
      const supabase = createSupabaseBrowser();
      await supabase.from("obligation_proofs").insert({
        obligation_id: detail.id,
        type,
        source_ref: sourceRef,
      });
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-black">{detail.title}</h2>
              <p className="text-xs text-gray-400">{detail.schoolName} · {detail.type}</p>
            </div>
            <div className="text-xs text-gray-500 text-right">
              {dueLine}
              {dueIn !== null && (
                <div className="text-[10px] text-gray-400">Due in {dueIn} days</div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
              {detail.status.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
              {detail.severity.toUpperCase()}
            </span>
          </div>
        </div>

        {/* What's true */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-400 uppercase">What&apos;s true</p>
          <p className="text-xs text-gray-600 mt-1">Source: {detail.source || "unknown"}</p>
          {detail.sourceRef && (
            <p className="text-xs text-gray-600">Ref: {detail.sourceRef}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">{detail.reasonLine}</p>
        </div>

        {/* Status timeline */}
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 uppercase">Timeline</p>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Created: {formatDate((detail as any).created_at)}</div>
            {(detail as any).submitted_at && <div>Submitted: {formatDate((detail as any).submitted_at)}</div>}
            {(detail as any).verified_at && <div>Verified: {formatDate((detail as any).verified_at)}</div>}
            {(detail as any).failed_at && <div>Failed: {formatDate((detail as any).failed_at)}</div>}
          </div>
        </div>

        {/* Proof section */}
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 uppercase">Proof</p>
          <div className="text-xs text-gray-600">
            Required: {detail.proofRequired ? "Yes" : "No"}
          </div>
          <div className="text-xs text-gray-500">Count: {proofs.length}</div>
          {proofs.length > 0 && (
            <ul className="text-xs text-gray-600 space-y-1">
              {proofs.map((p: any) => (
                <li key={p.id}>• {p.type} — {p.source_ref}</li>
              ))}
            </ul>
          )}
          <button
            onClick={addProof}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200"
          >
            Add proof
          </button>
        </div>

        {/* Blockers */}
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 uppercase">Blockers / Dependencies</p>
          {blockers.length === 0 ? (
            <p className="text-xs text-gray-500">No blockers</p>
          ) : (
            <ul className="text-xs text-gray-600 space-y-1">
              {blockers.map((b: any) => (
                <li key={`${b.obligation_id}-${b.status}`}>• {b.type} — {b.title} ({b.status})</li>
              ))}
            </ul>
          )}
          {stuckInfo?.stuck_reason && (
            <p className="text-xs text-gray-500">Stuck reason: {stuckInfo.stuck_reason}</p>
          )}
        </div>

        {/* Follow-ups */}
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 uppercase">Follow-ups</p>
          {drafts.length === 0 ? (
            <p className="text-xs text-gray-500">No drafts yet.</p>
          ) : (
            <div className="space-y-2">
              {drafts.map((d: any) => (
                <div key={d.id} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-800">{d.subject || "Draft"}</p>
                  <p className="text-[10px] text-gray-400">Status: {d.status}</p>
                  {d.status === "pending_approval" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setSelectedDraft(d)}
                        className="px-2 py-1 text-[10px] font-semibold border border-gray-200 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => sendDraft({
                          user_id: userId!,
                          follow_up_id: d.id,
                          edited_content: d.edited_content || null,
                          edited_subject: d.subject || null,
                        })}
                        className="px-2 py-1 text-[10px] font-semibold border border-gray-200 rounded"
                      >
                        Approve & Send
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedDraft && (
          <EmailDraftModal
            draft={selectedDraft}
            onClose={() => setSelectedDraft(null)}
            onImprove={(id, feedback) =>
              improveDraft({ user_id: userId!, follow_up_id: id, feedback }).then(
                (r) => r?.content ?? null
              )
            }
            onSend={(id, editedContent, editedSubject) =>
              sendDraft({ user_id: userId!, follow_up_id: id, edited_content: editedContent, edited_subject: editedSubject })
                .then(() => true)
                .catch(() => false)
            }
            onCancel={(id) => cancelDraft({ user_id: userId!, follow_up_id: id }).then(() => true).catch(() => false)}
          />
        )}
      </div>
    );
  }, [state, userId, obligationId]);

  return (
    <Drawer isOpen={drawerOpen} onClose={onClose} title="Obligation Detail">
      {content}
    </Drawer>
  );
}
