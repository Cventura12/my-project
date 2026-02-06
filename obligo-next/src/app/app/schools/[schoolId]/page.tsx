"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorState, PageTitle, SectionTitle, Skeleton } from "@/components/ui/Page";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useSchools } from "@/lib/hooks/useSchools";
import { getObligations } from "@/api/obligations";
import { STATUS_LABELS } from "@/lib/copy";
import { useSelection } from "@/components/v2/selection";

type Obligation = any;

type SchoolCounts = {
  unresolved: number;
  blocked: number;
  verificationMissing: number;
};

function normalizeName(name?: string | null) {
  return (name || "").trim().toLowerCase();
}

function extractSchoolIdFromSourceRef(ref?: string | null) {
  if (!ref) return null;
  const match = ref.match(/school:([^:]+):/i);
  return match?.[1] || null;
}

function getProofCount(obl: Obligation) {
  if (typeof obl.proof_count === "number") return obl.proof_count;
  if (typeof obl.proofs_count === "number") return obl.proofs_count;
  if (Array.isArray(obl.proofs)) return obl.proofs.length;
  return null;
}

function isProofMissing(obl: Obligation) {
  const proofCount = getProofCount(obl);
  return !!obl.proof_required && (obl.proof_missing === true || proofCount === 0);
}

function isBlocked(obl: Obligation) {
  return obl.status === "blocked" || obl.stuck === true || !!obl.stuck_reason;
}

function computeCounts(obligations: Obligation[]): SchoolCounts {
  return obligations.reduce(
    (acc, obl) => {
      const status = obl.status || "";
      const isVerified = status === "verified";
      const isFailed = status === "failed";
      if (!isVerified && !isFailed) acc.unresolved += 1;
      if (isBlocked(obl)) acc.blocked += 1;
      if (isProofMissing(obl)) acc.verificationMissing += 1;
      return acc;
    },
    { unresolved: 0, blocked: 0, verificationMissing: 0 }
  );
}

function statusLabel(obl: Obligation) {
  if (isProofMissing(obl)) return STATUS_LABELS.proofMissing;
  if (obl.status === "pending") return STATUS_LABELS.pending;
  if (obl.status === "submitted") return STATUS_LABELS.submitted;
  if (obl.status === "verified") return STATUS_LABELS.verified;
  if (obl.status === "failed") return STATUS_LABELS.failed;
  if (obl.status === "blocked" || isBlocked(obl)) return STATUS_LABELS.blocked;
  return (obl.status || "pending").toUpperCase();
}

function whyItMatters(obl: Obligation) {
  if (obl.stuck_reason) return `Blocked: ${obl.stuck_reason}`;
  if (obl.severity_reason) return `Time-sensitive: ${obl.severity_reason}`;
  if (isProofMissing(obl)) return "Verification required.";
  if (isBlocked(obl)) return "Blocked by dependency.";
  return null;
}

export default function SchoolDetailPage() {
  const params = useParams();
  const schoolIdParam = Array.isArray(params?.schoolId) ? params.schoolId[0] : params?.schoolId;
  const schoolId = schoolIdParam || "";
  const isUnassigned = schoolId === "unassigned";

  const { openDrawer } = useSelection();
  const { user } = useAuth();
  const { schools, loading: schoolsLoading, error: schoolsError, refresh } = useSchools();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [obligationsLoading, setObligationsLoading] = useState(true);
  const [obligationsError, setObligationsError] = useState<string | null>(null);

  const loadObligations = useCallback(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        setObligationsLoading(true);
        setObligationsError(null);
        const res = await getObligations(user.id);
        if (!alive) return;
        setObligations(res.obligations || []);
      } catch (e: any) {
        if (!alive) return;
        setObligations([]);
        setObligationsError(e?.message || "Failed to load obligations");
      } finally {
        if (alive) setObligationsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setObligations([]);
      setObligationsLoading(false);
      return;
    }
    const cleanup = loadObligations();
    return () => {
      if (cleanup) cleanup();
    };
  }, [user, loadObligations]);

  const loading = schoolsLoading || obligationsLoading;
  const error = schoolsError || obligationsError;

  const mapping = useMemo(() => {
    const bySchoolId = new Map<string, Obligation[]>();
    const unassigned: Obligation[] = [];

    const schoolsById = new Map(schools.map((s) => [s.id, s]));
    const schoolsByName = new Map(schools.map((s) => [normalizeName(s.name), s]));

    for (const obl of obligations) {
      const directId = obl.school_id || obl.schoolId || null;
      const refId = extractSchoolIdFromSourceRef(obl.source_ref || obl.sourceRef);
      const nameKey = normalizeName(obl.school_name || obl.schoolName || obl.school);

      let matchedId: string | null = null;
      if (directId && schoolsById.has(directId)) matchedId = directId;
      else if (refId && schoolsById.has(refId)) matchedId = refId;
      else if (nameKey && schoolsByName.has(nameKey)) matchedId = schoolsByName.get(nameKey)!.id;

      if (!matchedId) {
        unassigned.push(obl);
      } else {
        if (!bySchoolId.has(matchedId)) bySchoolId.set(matchedId, []);
        bySchoolId.get(matchedId)!.push(obl);
      }
    }

    return { bySchoolId, unassigned };
  }, [schools, obligations]);

  const school = schools.find((s) => s.id === schoolId) || null;
  const schoolName = isUnassigned ? "Unassigned to school" : school?.name || "Unknown school";

  const schoolObligations = useMemo(() => {
    if (isUnassigned) return mapping.unassigned;
    return mapping.bySchoolId.get(schoolId) || [];
  }, [isUnassigned, mapping, schoolId]);

  const unresolved = useMemo(
    () => schoolObligations.filter((o) => o.status !== "verified" && o.status !== "failed"),
    [schoolObligations]
  );

  const blocked = useMemo(() => schoolObligations.filter((o) => isBlocked(o)), [schoolObligations]);

  const verified = useMemo(() => schoolObligations.filter((o) => o.status === "verified"), [schoolObligations]);

  const counts = useMemo(() => computeCounts(schoolObligations), [schoolObligations]);

  const onRetry = () => {
    refresh();
    loadObligations();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (!isUnassigned && !school) {
    return <ErrorState message="School not found." onRetry={onRetry} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionTitle>School</SectionTitle>
        <PageTitle>{schoolName}</PageTitle>
        <p className="text-sm text-muted-foreground">
          {counts.unresolved} unresolved - {counts.blocked} blocked - {counts.verificationMissing} verification missing
        </p>
      </div>

      <section className="space-y-3">
        <SectionTitle>Unresolved requirements</SectionTitle>
        {unresolved.length === 0 ? (
          <div className="border border-border/60 rounded-xl p-4">
            <p className="text-sm text-muted-foreground">No unresolved requirements recorded.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {unresolved.map((obl) => (
              <div key={obl.id} className="border border-border/60 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{obl.title || "Untitled obligation"}</div>
                    <div className="text-xs text-muted-foreground">{statusLabel(obl)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {obl.deadline
                      ? new Date(obl.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "No deadline"}
                  </div>
                </div>
                {whyItMatters(obl) && (
                  <div className="text-xs text-muted-foreground mt-2">{whyItMatters(obl)}</div>
                )}
                <button
                  onClick={() => openDrawer(obl.id)}
                  className="mt-2 text-xs font-semibold text-foreground underline"
                >
                  View obligation detail
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Blocked</SectionTitle>
        {blocked.length === 0 ? (
          <div className="border border-border/60 rounded-xl p-4">
            <p className="text-sm text-muted-foreground">No blocked requirements recorded.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocked.map((obl) => {
              const blockedBy = Array.isArray(obl.blocked_by) ? obl.blocked_by : [];
              const firstBlocker = blockedBy[0];
              const blockedLine = firstBlocker
                ? `Blocked by: ${firstBlocker.title || firstBlocker.type || "dependency"}`
                : "Blocked by dependency.";
              return (
                <div key={obl.id} className="border border-border/60 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{obl.title || "Untitled obligation"}</div>
                      <div className="text-xs text-muted-foreground">{statusLabel(obl)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {obl.deadline
                        ? new Date(obl.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "No deadline"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{blockedLine}</div>
                  <button
                    onClick={() => openDrawer(obl.id)}
                    className="mt-2 text-xs font-semibold text-foreground underline"
                  >
                    View obligation detail
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <details className="border border-border/60 rounded-xl p-4">
        <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
          Verified ({verified.length})
        </summary>
        <div className="mt-3 space-y-3">
          {verified.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verified requirements recorded.</p>
          ) : (
            verified.map((obl) => (
              <div key={obl.id} className="border border-border/60 rounded-lg p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{obl.title || "Untitled obligation"}</div>
                    <div className="text-xs text-muted-foreground">{statusLabel(obl)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {obl.deadline
                      ? new Date(obl.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "No deadline"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </details>

      {!isUnassigned && mapping.unassigned.length > 0 && (
        <div className="border border-border/60 rounded-xl p-4">
          <p className="text-sm text-muted-foreground">
            Some obligations are not assigned to a school.
          </p>
          <Link href="/app/schools/unassigned" className="text-xs font-semibold text-foreground underline">
            View unassigned obligations
          </Link>
        </div>
      )}
    </div>
  );
}
