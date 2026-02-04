"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useSchools } from "@/lib/hooks/useSchools";
import { useDocuments, Document } from "@/lib/hooks/useDocuments";
import { useObligations, ObligationRow, ObligationBlocker } from "@/lib/hooks/useObligations";
import { useFollowUps } from "@/lib/hooks/useFollowUps";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import SchoolCard from "@/components/financial-aid/SchoolCard";
import {
  Plus, LogOut, FileText, AlertTriangle, CheckCircle2, Clock,
  Mail, FileEdit, MessageSquareWarning, Loader2, ShieldAlert, XOctagon, Ban, Lock,
} from "lucide-react";
import {
  getEscalationLevel,
  isSilentFailure,
  isVerificationBlocked,
  ESCALATION_STYLES,
  daysRemainingText,
  type EscalationLevel,
} from "@/lib/escalation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function FinancialAidDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { schools, loading: schoolsLoading } = useSchools();
  const { documents, loading: docsLoading } = useDocuments();
  const { obligations, loading: obligationsLoading, refresh: refreshObligations } = useObligations();
  const { pendingDrafts } = useFollowUps();
  const router = useRouter();
  const supabase = createSupabaseBrowser();
  const [busyObligationId, setBusyObligationId] = useState<string | null>(null);
  const [proofMissingIds, setProofMissingIds] = useState<Set<string>>(new Set());
  const [generatingFollowUp, setGeneratingFollowUp] = useState<string | null>(null);
  // Phase 2 Step 1 & 2: Dependency-blocked state.
  // Maps obligation_id -> list of blockers. If non-empty, obligation cannot be submitted/verified.
  //
  // DISCIPLINE: This state drives THREE things simultaneously:
  //   1. BLOCKED badge on the obligation title row (Phase 2 Step 2)
  //   2. Action guidance text showing what to do (Phase 2 Step 2)
  //   3. Button hiding — Submit/Verify buttons disappear when blocked (Phase 2 Step 1)
  // All three MUST stay in sync. If you add a new action button, check depBlocked.
  const [depBlockers, setDepBlockers] = useState<Record<string, ObligationBlocker[]>>({});

  const loading = authLoading || schoolsLoading || docsLoading || obligationsLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Phase 1 Step 4: Detect proof-missing obligations
  useEffect(() => {
    if (!user || obligationsLoading) return;
    const detectProofMissing = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/obligations/proof-missing?user_id=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const ids = new Set<string>((data.obligations || []).map((o: any) => o.id));
        setProofMissingIds(ids);
      } catch {
        // Silent fail — detection is advisory, not critical
      }
    };
    detectProofMissing();
  }, [user, obligationsLoading, obligations]);

  // Phase 2 Step 1: Evaluate dependency graph.
  // Calls the backend to auto-create edges from the hardcoded dependency map
  // and returns blocked state per obligation. No AI. No inference.
  useEffect(() => {
    if (!user || obligationsLoading) return;
    const evaluateDeps = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/obligations/dependencies?user_id=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const blockerMap: Record<string, ObligationBlocker[]> = {};
        for (const obl of data.obligations || []) {
          if (obl.blockers && obl.blockers.length > 0) {
            blockerMap[obl.obligation_id] = obl.blockers;
          }
        }
        setDepBlockers(blockerMap);
      } catch {
        // Silent fail — dependency evaluation is advisory
      }
    };
    evaluateDeps();
  }, [user, obligationsLoading, obligations]);

  // ---------------------------------------------------------------------------
  // Phase 1 Step 5: Escalation States (DETERMINISTIC)
  //
  // Compute escalation level for every obligation. No AI. No predictions.
  // proofMissingIds is used as the source of truth for "has proof" — if the
  // obligation ID is in proofMissingIds, proof is missing.
  //
  // The escalation level drives visual loudness and blocking behavior.
  // ---------------------------------------------------------------------------
  const getOblEscalation = (obl: ObligationRow): EscalationLevel => {
    return getEscalationLevel({
      status: obl.status,
      deadline: obl.deadline,
      proof_required: obl.proof_required,
      has_proof: obl.proof_required ? !proofMissingIds.has(obl.id) : true,
    });
  };

  const isOblSilentFailure = (obl: ObligationRow): boolean => {
    return isSilentFailure({
      status: obl.status,
      proof_required: obl.proof_required,
      has_proof: obl.proof_required ? !proofMissingIds.has(obl.id) : true,
    });
  };

  // Canonical stats: obligations only.
  const totalObligations = obligations.length;
  const submitted = obligations.filter((o) => o.status === "submitted" || o.status === "verified").length;

  // Step 5: Escalation-aware stats replace naive "overdue" and "pending" counts.
  const failureCount = obligations.filter((o) => getOblEscalation(o) === "failure").length;
  const criticalCount = obligations.filter((o) => getOblEscalation(o) === "critical").length;
  const urgentCount = obligations.filter((o) => getOblEscalation(o) === "urgent").length;

  const visibleObligations = obligations
    // Phase 1 Step 3: include submitted so verification is possible (proof-gated).
    .filter((o) => o.status !== "verified")
    // Phase 1 Step 5: Sort by escalation severity. Failures first.
    .sort((a, b) => {
      const order: Record<EscalationLevel, number> = { failure: 0, critical: 1, urgent: 2, normal: 3 };
      return order[getOblEscalation(a)] - order[getOblEscalation(b)];
    })
    .slice(0, 12);

  const ensureProofExists = async (obligationId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("obligation_proofs")
      .select("id")
      .eq("obligation_id", obligationId)
      .limit(1);

    if (error) throw error;
    return (data || []).length > 0;
  };

  const setObligationStatus = async (
    oblId: string,
    nextStatus: "submitted" | "verified",
    proofRequired: boolean
  ) => {
    if (!user) return;

      // Phase 2 Step 1 & 2: Block transitions when dependencies are unmet.
    // Checked FIRST because dependencies are more fundamental than proof.
    //
    // DISCIPLINE: This is defense-in-depth. The UI already hides Submit/Verify
    // buttons when depBlocked (see render below). This handler check exists
    // because a determined user could call this function programmatically,
    // and the database trigger (enforce_obligation_dependencies) is the final
    // safety net. Three layers: UI hiding → handler check → DB trigger.
    //
    // The alert text is BLUNT. "BLOCKED" not "unable to proceed." The user
    // must understand this is not a suggestion — it is a hard constraint.
    const blockers = depBlockers[oblId];
    if (blockers && blockers.length > 0 && (nextStatus === "submitted" || nextStatus === "verified")) {
      const blockerList = blockers.map((b) => {
        const action =
          b.status === "pending" || b.status === "blocked"
            ? "Submit and verify"
            : b.status === "submitted"
            ? "Verify"
            : "Complete";
        return `  - ${b.type} ("${b.title}") → ${action} this first`;
      }).join("\n");
      alert(
        `BLOCKED: This obligation depends on ${blockers.length} unverified prerequisite(s):\n\n` +
        `${blockerList}\n\n` +
        `You cannot proceed until all prerequisites are verified.`
      );
      return;
    }

    // Phase 1 Step 5: Block verification at CRITICAL/FAILURE when proof is missing.
    // This prevents dangerous optimism.
    if (nextStatus === "verified") {
      const obl = obligations.find((o) => o.id === oblId);
      if (obl) {
        const escalation = getOblEscalation(obl);
        const hasProof = proofRequired ? !proofMissingIds.has(oblId) : true;
        if (isVerificationBlocked(escalation, proofRequired, hasProof)) {
          const style = ESCALATION_STYLES[escalation];
          alert(
            `BLOCKED: This obligation is at ${style.badgeText} level.\n\n` +
            `${style.label}.\n\n` +
            `Proof is required before verification. Attach proof first.\n` +
            `The system will not allow you to dismiss this obligation without evidence.`
          );
          return;
        }
      }
    }

    setBusyObligationId(oblId);
    try {
      // Phase 1 Step 3: proof check (defense in depth — Step 5 blocks above, this is the safety net)
      if (nextStatus === "verified" && proofRequired) {
        const hasProof = await ensureProofExists(oblId);
        if (!hasProof) {
          alert("Blocked: proof is required to verify this obligation. Attach proof first.");
          return;
        }
      }

      const { error } = await supabase
        .from("obligations")
        .update({ status: nextStatus })
        .eq("id", oblId)
        .eq("user_id", user.id);

      if (error) {
        alert(error.message);
        return;
      }

      await refreshObligations();
    } catch (e: any) {
      alert(e?.message || "Failed to update obligation status");
    } finally {
      setBusyObligationId(null);
    }
  };

  const attachManualProof = async (oblId: string) => {
    if (!user) return;

    const type = (prompt("Proof type (receipt | portal_screenshot | file_upload):", "receipt") || "").trim();
    const allowed = new Set(["receipt", "portal_screenshot", "file_upload"]);
    if (!allowed.has(type)) {
      alert("Invalid proof type");
      return;
    }

    const sourceRef = (prompt("Proof reference (file URL or short note):") || "").trim();
    if (!sourceRef) return;

    setBusyObligationId(oblId);
    try {
      const { error } = await supabase.from("obligation_proofs").insert({
        obligation_id: oblId,
        type,
        source_ref: sourceRef,
      });

      if (error) {
        alert(error.message);
        return;
      }

      alert("Proof attached.");
    } catch (e: any) {
      alert(e?.message || "Failed to attach proof");
    } finally {
      setBusyObligationId(null);
    }
  };

  // Phase 1 Step 4: Generate a recovery draft for a proof-missing obligation
  const handleGenerateFollowUp = async (oblId: string) => {
    if (!user) return;
    setGeneratingFollowUp(oblId);
    try {
      const res = await fetch(`${API_BASE}/api/obligations/generate-recovery-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, obligation_ids: [oblId] }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Failed to generate follow-up draft");
        return;
      }
      const data = await res.json();
      if (data.drafts_created > 0) {
        setProofMissingIds((prev) => {
          const next = new Set(prev);
          next.delete(oblId);
          return next;
        });
        router.push("/financial-aid/approvals");
      } else if (data.skipped > 0) {
        alert("A follow-up draft already exists for this obligation. Check Approvals.");
        router.push("/financial-aid/approvals");
      }
    } catch {
      alert("Failed to generate follow-up draft");
    } finally {
      setGeneratingFollowUp(null);
    }
  };

  // Group documents by school
  const docsBySchool = documents.reduce<Record<string, Document[]>>((acc, doc) => {
    if (!acc[doc.school_id]) acc[doc.school_id] = [];
    acc[doc.school_id].push(doc);
    return acc;
  }, {});

  if (loading) {
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
            <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white font-bold">O</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-black">Financial Aid Tracker</h1>
              <p className="text-xs text-gray-400">
                {user?.email?.split("@")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/emails")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors"
            >
              <Mail className="w-4 h-4" />
              Emails
            </button>
            <button
              onClick={() => router.push("/financial-aid/approvals")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors relative"
            >
              <FileEdit className="w-4 h-4" />
              Approvals
              {pendingDrafts.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {pendingDrafts.length}
                </span>
              )}
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="text-sm text-gray-400 hover:text-black transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats — Phase 1 Step 5: escalation-aware stat cards */}
        {totalObligations > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <FileText className="w-5 h-5 text-gray-400 mx-auto" />
              <p className="text-2xl font-bold text-black mt-1">{totalObligations}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Total</p>
            </div>
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
              <p className="text-2xl font-bold text-emerald-600 mt-1">{submitted}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Submitted</p>
            </div>
            <div className={`bg-white border-2 rounded-xl p-4 text-center ${criticalCount > 0 ? "border-red-400" : urgentCount > 0 ? "border-yellow-400" : "border-black"}`}>
              <ShieldAlert className={`w-5 h-5 mx-auto ${criticalCount > 0 ? "text-red-500" : urgentCount > 0 ? "text-yellow-500" : "text-gray-400"}`} />
              <p className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? "text-red-600" : urgentCount > 0 ? "text-yellow-600" : "text-gray-600"}`}>
                {criticalCount + urgentCount}
              </p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">At Risk</p>
            </div>
            <div className={`border-2 rounded-xl p-4 text-center ${failureCount > 0 ? "bg-red-100 border-red-600" : "bg-white border-black"}`}>
              <XOctagon className={`w-5 h-5 mx-auto ${failureCount > 0 ? "text-red-700" : "text-gray-400"}`} />
              <p className={`text-2xl font-black mt-1 ${failureCount > 0 ? "text-red-800" : "text-gray-600"}`}>{failureCount}</p>
              <p className={`text-[10px] font-medium uppercase ${failureCount > 0 ? "text-red-700 font-bold" : "text-gray-400"}`}>Failed</p>
            </div>
          </div>
        )}

        {/* Phase 1 Step 5: Failure banner — unmistakable */}
        {failureCount > 0 && (
          <div className="bg-red-700 border-2 border-red-900 rounded-xl p-4 mb-6 flex items-center gap-3">
            <XOctagon className="w-6 h-6 text-white shrink-0" />
            <div>
              <p className="text-sm text-white font-bold">
                {failureCount} obligation{failureCount > 1 ? "s" : ""} failed. Deadline passed without verification.
              </p>
              <p className="text-xs text-red-200 mt-0.5">
                These cannot be dismissed. Attach proof or take action.
              </p>
            </div>
          </div>
        )}

        {/* Phase 1 Step 5: Critical banner */}
        {criticalCount > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 font-bold">
              {criticalCount} obligation{criticalCount > 1 ? "s" : ""} critical. Deadline within 3 days.
            </p>
          </div>
        )}

        {/* Phase 1 Step 5: Urgent banner */}
        {urgentCount > 0 && failureCount === 0 && criticalCount === 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-600 shrink-0" />
            <p className="text-sm text-yellow-700 font-medium">
              {urgentCount} obligation{urgentCount > 1 ? "s" : ""} due within 7 days.
            </p>
          </div>
        )}

        {/* Obligations (canonical "things due") — Phase 1 Step 5: escalation-aware rendering */}
        {visibleObligations.length > 0 && (
          <div className="bg-white border-2 border-black rounded-xl p-5 mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Obligations
            </h2>
            <div className="divide-y divide-gray-100">
              {visibleObligations.map((obl) => {
                // Phase 1 Step 5: Compute escalation per obligation.
                // Deterministic. No AI. Just date arithmetic and status checks.
                const escalation = getOblEscalation(obl);
                const style = ESCALATION_STYLES[escalation];
                const silentFailure = isOblSilentFailure(obl);
                const hasProof = obl.proof_required ? !proofMissingIds.has(obl.id) : true;
                const verifyBlocked = isVerificationBlocked(escalation, obl.proof_required, hasProof);
                const remaining = daysRemainingText(obl.deadline);
                // Phase 2 Step 1: Dependency-blocked state.
                // Phase 2 Step 2: Blocked state is EXPLICIT. Not subtle. Not a tooltip.
                // If blocked, the user sees BLOCKED in the title row, the row gets a
                // distinct visual treatment, and action guidance tells them exactly
                // what to do. No ambiguity. No guessing.
                const blockers = depBlockers[obl.id] || [];
                const depBlocked = blockers.length > 0;

                // Phase 2 Step 2: Row styling. Blocked gets its own visual treatment.
                // If escalation is active (urgent/critical/failure), escalation styling
                // takes priority because deadline urgency is existential. But the BLOCKED
                // badge still appears — the user sees BOTH signals.
                // If no escalation, blocked obligations get a slate border + gray wash
                // to communicate "frozen — cannot proceed."
                const rowBorder = depBlocked && escalation === "normal"
                  ? "border-l-4 border-l-gray-500"
                  : style.rowBorder;
                const rowBg = depBlocked && escalation === "normal"
                  ? "bg-gray-50/70"
                  : style.rowBg;

                return (
                  <div
                    key={obl.id}
                    className={`py-3 pl-3 flex items-start justify-between gap-4 rounded-lg ${rowBorder} ${rowBg}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-black truncate">{obl.title}</p>
                        {/* Phase 2 Step 2: BLOCKED badge — first badge, always visible when blocked.
                            This is NOT a tooltip. NOT an icon-only hint. It is text that says BLOCKED.
                            The user cannot miss it. */}
                        {depBlocked && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-gray-700 text-white border border-gray-800">
                            <Lock className="w-2.5 h-2.5" />
                            BLOCKED
                          </span>
                        )}
                        {/* Phase 1 Step 5: Escalation badge — intentionally loud */}
                        {style.badgeText && (
                          <span className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase rounded-full ${style.badge}`}>
                            {style.badgeText}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {obl.type} - {obl.source}
                      </p>
                      {obl.proof_required && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Proof required
                        </span>
                      )}
                      {proofMissingIds.has(obl.id) && (
                        <span className="inline-flex items-center gap-1 mt-1 ml-1 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                          <MessageSquareWarning className="w-3 h-3" />
                          Follow-up recommended
                        </span>
                      )}

                      {/* Phase 1 Step 5: Silent failure warning — blunt language, no softening */}
                      {silentFailure && (
                        <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
                          escalation === "failure"
                            ? "bg-red-100 text-red-800 border border-red-300"
                            : escalation === "critical"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-orange-50 text-orange-700 border border-orange-200"
                        }`}>
                          This obligation was submitted but has not been confirmed.
                          {escalation === "failure"
                            ? " Silent failure. Deadline has passed."
                            : escalation === "critical"
                            ? " Silent failure risk. Deadline imminent."
                            : " No confirmation exists."}
                        </div>
                      )}

                      {/* Phase 1 Step 5: Verification blocked warning */}
                      {verifyBlocked && (
                        <div className="mt-2 px-3 py-2 rounded-lg text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                          Verification blocked. Proof is required at {style.badgeText} level.
                        </div>
                      )}

                      {/* Phase 2 Step 2: Dependency-blocked warning — LEGIBLE.
                          Three things the user must know immediately:
                          1. This obligation IS blocked (the badge says BLOCKED)
                          2. WHAT is blocking it (each blocker listed by name)
                          3. WHAT ACTION unblocks it (explicit verb: "Verify X" or "Submit X")
                          No softened language. No "might be blocked." It IS blocked. */}
                      {depBlocked && (
                        <div className="mt-2 px-3 py-2.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-800 border-2 border-gray-400">
                          <div className="flex items-center gap-1.5 font-bold mb-1.5 text-gray-900">
                            <Ban className="w-3.5 h-3.5" />
                            Blocked by {blockers.length} prerequisite{blockers.length > 1 ? "s" : ""}
                          </div>
                          {blockers.map((b) => {
                            // Phase 2 Step 2: Action guidance — tell the user EXACTLY what to do.
                            // No vague "complete this first." Explicit verbs based on current status.
                            const action =
                              b.status === "pending" || b.status === "blocked"
                                ? `Submit and verify "${b.title}"`
                                : b.status === "submitted"
                                ? `Verify "${b.title}"`
                                : `Complete "${b.title}"`;
                            return (
                              <div key={b.obligation_id} className="ml-5 mb-1 last:mb-0">
                                <p className="text-[11px] text-gray-700 font-semibold">
                                  {b.type}: {b.title} — <span className="uppercase text-gray-500">{b.status}</span>
                                </p>
                                <p className="text-[10px] text-gray-600 italic">
                                  → {action} to unblock
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-medium ${style.deadlineColor}`}>
                        {obl.deadline ? new Date(obl.deadline).toLocaleDateString() : "No deadline"}
                      </p>
                      {/* Phase 1 Step 5: Show days remaining — no sugar coating */}
                      {remaining && (
                        <p className={`text-[10px] font-semibold mt-0.5 ${style.deadlineColor}`}>
                          {remaining}
                        </p>
                      )}
                      <p className={`text-[10px] font-semibold uppercase mt-0.5 ${style.statusColor}`}>
                        {obl.status}
                      </p>
                      <div className="mt-2 flex items-center justify-end gap-2 flex-wrap">
                        {obl.proof_required && obl.status !== "verified" && (
                          <button
                            onClick={() => attachManualProof(obl.id)}
                            disabled={busyObligationId === obl.id}
                            className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
                              escalation === "critical" || escalation === "failure"
                                ? "border-red-400 text-red-700 hover:border-red-600 hover:bg-red-50 font-bold"
                                : "border-gray-200 text-gray-600 hover:border-black hover:text-black"
                            }`}
                            title="Attach proof (append-only)"
                          >
                            Proof
                          </button>
                        )}
                        {(obl.status === "pending" || obl.status === "blocked") && !depBlocked && (
                          <button
                            onClick={() => setObligationStatus(obl.id, "submitted", obl.proof_required)}
                            disabled={busyObligationId === obl.id}
                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                          >
                            Submitted
                          </button>
                        )}
                        {obl.status === "submitted" && !verifyBlocked && !depBlocked && (
                          <button
                            onClick={() => setObligationStatus(obl.id, "verified", obl.proof_required)}
                            disabled={busyObligationId === obl.id}
                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            title={obl.proof_required ? "Blocked without proof" : "Mark verified"}
                          >
                            Verify
                          </button>
                        )}
                        {proofMissingIds.has(obl.id) && (
                          <button
                            onClick={() => handleGenerateFollowUp(obl.id)}
                            disabled={generatingFollowUp === obl.id}
                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                            title="Generate a follow-up email draft (requires your approval before sending)"
                          >
                            {generatingFollowUp === obl.id ? (
                              <Loader2 className="w-3 h-3 animate-spin inline" />
                            ) : (
                              "Follow-up"
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Schools */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Your Schools</h2>
          <button
            onClick={() => router.push("/onboarding")}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add school
          </button>
        </div>

        {schools.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No schools added yet.</p>
            <button
              onClick={() => router.push("/onboarding")}
              className="mt-4 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add your schools
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <SchoolCard key={school.id} school={school} documents={docsBySchool[school.id] || []} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
