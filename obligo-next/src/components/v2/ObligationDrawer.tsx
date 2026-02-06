"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import Drawer from "@/components/Drawer";
import { Badge, Button, ErrorState, Skeleton } from "@/components/ui/Page";
import {
  getDependencies,
  getObligations,
  getProofMissing,
  getSteps,
  getStuckDetection,
} from "@/api/obligations";
import { listDrafts, improveDraft, sendDraft, cancelDraft } from "@/api/approvals";
import { toUIObligationSummary } from "@/adapters/obligationAdapter";
import { UIObligationDetail } from "@/types/ui";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import EmailDraftModal from "@/components/financial-aid/EmailDraftModal";
import { BUTTON_LABELS, STATUS_LABELS } from "@/lib/copy";

type DrawerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      detail: UIObligationDetail & {
        created_at?: string | null;
        submitted_at?: string | null;
        verified_at?: string | null;
        failed_at?: string | null;
        status_changed_at?: string | null;
        severity_since?: string | null;
      };
      proofs: any[];
      drafts: any[];
      blockers: any[];
      stuckInfo?: any;
    };

function formatDate(dt?: string | null) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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
  const verificationRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const load = async () => {
    if (!userId || !obligationId) {
      setState({ status: "idle" });
      return;
    }

    try {
      setState({ status: "loading" });
      const [obls, , stuck, , steps, drafts] = await Promise.all([
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

      const detail: UIObligationDetail & {
        created_at?: string | null;
        submitted_at?: string | null;
        verified_at?: string | null;
        failed_at?: string | null;
        status_changed_at?: string | null;
        severity_since?: string | null;
      } = {
        ...summary,
        source: obligation.source,
        sourceRef: obligation.source_ref,
        blockers: blockedBy,
        overrides: obligation.overridden_deps || [],
        steps: steps.steps || [],
        stuck: !!(stuckInfo?.stuck ?? summary.stuck),
        reasonLine: summary.reasonLine,
        proofCount: proofs.length,
        created_at: obligation.created_at,
        submitted_at: obligation.submitted_at,
        verified_at: obligation.verified_at,
        failed_at: obligation.failed_at,
        status_changed_at: obligation.status_changed_at,
        severity_since: obligation.severity_since,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const drawerOpen = !!obligationId;

  const content = useMemo(() => {
    if (state.status === "loading") {
      return (
        <div className="space-y-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      );
    }
    if (state.status === "error") {
      return <ErrorState message={state.message} onRetry={load} />;
    }
    if (state.status !== "ready") {
      return <p className="text-sm text-muted-foreground">Select an obligation.</p>;
    }

    const { detail, proofs, drafts, blockers, stuckInfo } = state;
    const dueIn = daysUntil(detail.deadline ? detail.deadline.toISOString() : null);
    const dueLine = detail.deadline
      ? `Due ${detail.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "No deadline recorded";

    const statusLabel = () => {
      if (detail.proofRequired && detail.proofCount === 0) return STATUS_LABELS.proofMissing;
      if (detail.status === "pending") return STATUS_LABELS.pending;
      if (detail.status === "submitted") return STATUS_LABELS.submitted;
      if (detail.status === "verified") return STATUS_LABELS.verified;
      if (detail.status === "failed") return STATUS_LABELS.failed;
      if (detail.status === "blocked" || detail.isBlocked) return STATUS_LABELS.blocked;
      return detail.status?.toUpperCase() || STATUS_LABELS.pending;
    };

    const statusMeaning = () => {
      if (detail.status === "submitted") {
        return "This obligation is not considered complete until verification is attached.";
      }
      if (detail.status === "blocked" || detail.isBlocked) {
        return "This obligation cannot proceed until blocking dependencies are verified.";
      }
      if (detail.status === "verified") {
        return "Verified. This obligation is complete unless the institution changes requirements.";
      }
      if (detail.status === "failed") {
        return "Requirement failed. This state is irreversible.";
      }
      if (detail.proofRequired && detail.proofCount === 0) {
        return "Verification missing. This obligation cannot be verified.";
      }
      return "Unresolved. Verification is required to complete this obligation.";
    };

    const verificationActionLabel = detail.proofRequired
      ? detail.proofCount === 0
        ? BUTTON_LABELS.uploadProof
        : BUTTON_LABELS.reviewVerification
      : BUTTON_LABELS.reviewObligation;

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
      await load();
      if (!reducedMotion && verificationRef.current) {
        gsap.fromTo(
          verificationRef.current,
          { opacity: 0.6, y: 6 },
          { opacity: 1, y: 0, duration: 0.2, ease: "power1.out" }
        );
      }
    };

    const handleVerificationAction = () => {
      if (detail.proofRequired && detail.proofCount === 0) {
        addProof();
        return;
      }
      verificationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const history: Array<{ label: string; date: string | null | undefined }> = [];
    history.push({ label: "Created", date: detail.created_at });
    if (detail.status_changed_at) history.push({ label: "Status changed", date: detail.status_changed_at });
    if (detail.submitted_at) history.push({ label: STATUS_LABELS.submitted, date: detail.submitted_at });
    if (detail.verified_at) history.push({ label: STATUS_LABELS.verified, date: detail.verified_at });
    if (detail.failed_at) history.push({ label: STATUS_LABELS.failed, date: detail.failed_at });
    if (detail.severity_since) history.push({ label: "Severity escalated", date: detail.severity_since });

    const blocks = (detail as any).blocks || [];

    return (
      <div className="space-y-8 text-sm text-foreground">
        {/* A) Header */}
        <section className="space-y-2 border-b border-border/60 pb-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{detail.title}</h2>
            <div className="text-sm text-muted-foreground">{detail.type}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            Source: {detail.source || "unknown"}
            {detail.sourceRef ? ` - Ref: ${detail.sourceRef}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">Created {formatDate(detail.created_at)}</div>
        </section>

        {/* B) Status */}
        <section className="space-y-3 border-b border-border/60 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
          <div className="text-2xl font-semibold text-foreground">{statusLabel()}</div>
          <p className="text-sm text-muted-foreground">{statusMeaning()}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="neutral">Severity: {detail.severity.toUpperCase()}</Badge>
            <Badge variant="neutral">
              {dueLine}{dueIn !== null ? ` - Due in ${dueIn} days` : ""}
            </Badge>
          </div>
        </section>

        {/* C) Verification */}
        <section ref={verificationRef} className="space-y-3 border-b border-border/60 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verification</div>
          <div className="text-sm text-foreground">
            Required: <span className="font-semibold">{detail.proofRequired ? "Yes" : "No"}</span>
          </div>
          <div className="text-sm text-foreground">
            Attached proofs: <span className="font-semibold">{proofs.length}</span>
          </div>
          {detail.proofRequired && proofs.length === 0 && (
            <div className="text-sm text-foreground">{STATUS_LABELS.proofMissing}</div>
          )}
          {proofs.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {proofs.map((p: any) => (
                <li key={p.id}>- {p.type} - {p.source_ref}</li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-muted-foreground">No proofs attached.</div>
          )}
          <Button onClick={handleVerificationAction} variant="secondary" className="w-full">
            {verificationActionLabel}
          </Button>
        </section>

        {/* D) Dependencies */}
        <section className="space-y-3 border-b border-border/60 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dependencies</div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Blocked by</div>
            {blockers.length === 0 ? (
              <div className="text-xs text-muted-foreground">No dependencies recorded.</div>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {blockers.map((b: any) => (
                  <li key={`${b.obligation_id}-${b.status}`}>- {b.type} - {b.title} ({b.status})</li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Blocks</div>
            {blocks.length === 0 ? (
              <div className="text-xs text-muted-foreground">No dependencies recorded.</div>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {blocks.map((b: any) => (
                  <li key={`${b.obligation_id || b.id}-${b.status || ""}`}>
                    - {b.type} - {b.title} ({b.status})
                  </li>
                ))}
              </ul>
            )}
          </div>
          {detail.overrides && detail.overrides.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Overrides</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {detail.overrides.map((o: any) => (
                  <li key={`${o.title}-${o.status}-${o.created_at || ""}`}>
                    - {o.type} - {o.title} ({o.status}) {o.created_at ? ` - ${formatDate(o.created_at)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stuckInfo?.stuck_reason && (
            <div className="text-xs text-muted-foreground">Stuck reason: {stuckInfo.stuck_reason}</div>
          )}
        </section>

        {/* E) History */}
        <section className="space-y-3 border-b border-border/60 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History (Immutable)</div>
          {history.filter((h) => h.date).length === 0 ? (
            <div className="text-xs text-muted-foreground">No history recorded.</div>
          ) : (
            <ul className="space-y-2 text-xs text-muted-foreground">
              {history
                .filter((h) => h.date)
                .map((h) => (
                  <li key={`${h.label}-${h.date}`}>- {h.label} - {formatDate(h.date)}</li>
                ))}
            </ul>
          )}
        </section>

        {/* F) Actions */}
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</div>
          {drafts.length === 0 ? (
            <div className="text-xs text-muted-foreground">No follow-up drafts.</div>
          ) : (
            <div className="space-y-3">
              {drafts.map((d: any) => (
                <div key={d.id} className="border border-border/60 rounded-lg p-3">
                  <p className="text-xs font-semibold text-foreground">{d.subject || "Draft"}</p>
                  <p className="text-[10px] text-muted-foreground">Status: {d.status}</p>
                  {d.status === "pending_approval" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        onClick={() => setSelectedDraft(d)}
                        variant="secondary"
                        size="sm"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() =>
                          sendDraft({
                            user_id: userId!,
                            follow_up_id: d.id,
                            edited_content: d.edited_content || null,
                            edited_subject: d.subject || null,
                          })
                        }
                        variant="secondary"
                        size="sm"
                      >
                        Approve & Send
                      </Button>
                      <Button
                        onClick={() => cancelDraft({ user_id: userId!, follow_up_id: d.id })}
                        variant="ghost"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

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
              sendDraft({
                user_id: userId!,
                follow_up_id: id,
                edited_content: editedContent,
                edited_subject: editedSubject,
              })
                .then(() => true)
                .catch(() => false)
            }
            onCancel={(id) =>
              cancelDraft({ user_id: userId!, follow_up_id: id })
                .then(() => true)
                .catch(() => false)
            }
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
