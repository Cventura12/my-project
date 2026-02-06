"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ErrorState, PageTitle, Skeleton } from "@/components/ui/Page";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useSchools } from "@/lib/hooks/useSchools";
import { getObligations } from "@/api/obligations";
import { EMPTY_STATES, NAV_LABELS } from "@/lib/copy";

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

export default function SchoolsPage() {
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

  const schoolRows = useMemo(() => {
    return schools.map((school) => {
      const obs = mapping.bySchoolId.get(school.id) || [];
      return { school, counts: computeCounts(obs) };
    });
  }, [schools, mapping.bySchoolId]);

  const unassignedCounts = useMemo(() => computeCounts(mapping.unassigned), [mapping.unassigned]);

  const onRetry = () => {
    refresh();
    loadObligations();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  const hasUnassigned = mapping.unassigned.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageTitle>{NAV_LABELS.schools}</PageTitle>
        <p className="text-sm text-muted-foreground">Institution context for your obligations.</p>
      </div>

      {schools.length === 0 && !hasUnassigned && (
        <div className="border border-border/60 rounded-xl p-4">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{EMPTY_STATES.schools}</p>
        </div>
      )}

      {schools.length > 0 && (
        <div className="space-y-3">
          {schoolRows.map((row) => (
            <Link
              key={row.school.id}
              href={`/app/schools/${row.school.id}`}
              className="block border border-border/60 rounded-xl p-4 hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{row.school.name}</div>
                  <div className="text-xs text-muted-foreground">Unresolved: {row.counts.unresolved}</div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Blocked: {row.counts.blocked}</span>
                  <span>Verification missing: {row.counts.verificationMissing}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasUnassigned && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unassigned to school
          </div>
          <Link
            href="/app/schools/unassigned"
            className="block border border-border/60 rounded-xl p-4 hover:bg-muted/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Unassigned to school</div>
                <div className="text-xs text-muted-foreground">Unresolved: {unassignedCounts.unresolved}</div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Blocked: {unassignedCounts.blocked}</span>
                <span>Verification missing: {unassignedCounts.verificationMissing}</span>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
