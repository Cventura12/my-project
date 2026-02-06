"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getObligations } from "@/api/obligations";
import { toUIObligationSummary } from "@/adapters/obligationAdapter";
import { groupTodayObligations } from "@/lib/todayGrouping";
import { UIObligationSummary } from "@/types/ui";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Page";
import { useAuth } from "@/lib/supabase/auth-provider";
import { EMPTY_STATES, STATUS_LABELS, BUTTON_LABELS } from "@/lib/copy";
import { useSelection } from "@/components/v2/selection";

export default function TodayPage() {
  const { user } = useAuth();
  const { openDrawer } = useSelection();
  const [items, setItems] = useState<UIObligationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getObligations(user.id);
        const mapped = (res.obligations || []).map((obl: any) =>
          toUIObligationSummary({
            obligation: obl,
            schoolName: "Unknown school",
            proofs: [],
            blockedBy: obl.blocked_by || [],
          })
        );
        if (alive) setItems(mapped);
      } catch (e: any) {
        if (alive) {
          setItems([]);
          setError(e?.message || "Failed to load obligations");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const cleanup = load();
    return () => {
      if (cleanup) cleanup();
    };
  }, [user, load]);

  const groups = useMemo(() => groupTodayObligations(items), [items]);

  const relevant = useMemo(() => {
    const set = new Map<string, UIObligationSummary>();
    for (const item of groups.atRisk) set.set(item.id, item);
    for (const item of groups.blocked) set.set(item.id, item);
    for (const item of groups.unverified) set.set(item.id, item);
    return Array.from(set.values());
  }, [groups]);

  const rank = (item: UIObligationSummary) => {
    if (item.severity === "critical" || item.severity === "failed") return 3;
    if (item.severity === "high") return 2;
    return 1;
  };

  const topThree = useMemo(() => {
    return [...relevant].sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  }, [relevant]);

  const bySeverity = useMemo(() => {
    const critical: UIObligationSummary[] = [];
    const high: UIObligationSummary[] = [];
    const normal: UIObligationSummary[] = [];
    for (const item of topThree) {
      if (item.severity === "critical" || item.severity === "failed") critical.push(item);
      else if (item.severity === "high") high.push(item);
      else normal.push(item);
    }
    return { critical, high, normal };
  }, [topThree]);

  const statusLabel = (item: UIObligationSummary) => {
    if (item.proofRequired && item.proofCount === 0) return STATUS_LABELS.proofMissing;
    if (item.status === "pending") return STATUS_LABELS.pending;
    if (item.status === "submitted") return STATUS_LABELS.submitted;
    if (item.status === "verified") return STATUS_LABELS.verified;
    if (item.status === "failed") return STATUS_LABELS.failed;
    if (item.status === "blocked" || item.isBlocked) return STATUS_LABELS.blocked;
    return item.status?.toUpperCase() || STATUS_LABELS.pending;
  };

  const consequenceLine = (item: UIObligationSummary) => {
    if (item.proofRequired && item.proofCount === 0) {
      return "Verification missing. This obligation cannot be verified.";
    }
    if (item.isBlocked || item.status === "blocked") {
      return "Blocked by dependency. This obligation cannot proceed until prerequisites are verified.";
    }
    if (item.deadline) {
      return "Time-sensitive. Deadline is approaching and verification is required.";
    }
    return "Unresolved. This obligation remains open.";
  };

  const actionLabel = (item: UIObligationSummary) => {
    if (item.proofRequired && item.proofCount === 0) return BUTTON_LABELS.uploadProof;
    return BUTTON_LABELS.reviewObligation;
  };

  const renderItem = (item: UIObligationSummary) => (
    <div key={item.id} className="border border-border/60 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">{item.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{statusLabel(item)}</p>
        </div>
        <div className="text-right text-xs">
          {item.deadline ? (
            <>
              <div className="text-foreground font-medium">
                {item.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
              <div className="text-muted-foreground">Deadline</div>
            </>
          ) : (
            <div className="text-muted-foreground">No deadline</div>
          )}
        </div>
      </div>
      <p className="text-sm text-foreground">{consequenceLine(item)}</p>
      <button
        onClick={() => openDrawer(item.id)}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90"
      >
        {actionLabel(item)}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Today</h1>
        <p className="text-sm text-muted-foreground">
          These items require attention to prevent administrative failure.
        </p>
      </div>

      {topThree.length === 0 && (
        <EmptyState>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{EMPTY_STATES.today}</p>
        </EmptyState>
      )}

      {bySeverity.critical.length > 0 && (
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Critical
          </div>
          <div className="space-y-4">{bySeverity.critical.map(renderItem)}</div>
        </section>
      )}

      {bySeverity.high.length > 0 && (
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            High
          </div>
          <div className="space-y-4">{bySeverity.high.map(renderItem)}</div>
        </section>
      )}

      {bySeverity.normal.length > 0 && (
        <section className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Normal
          </div>
          <div className="space-y-4">{bySeverity.normal.map(renderItem)}</div>
        </section>
      )}
    </div>
  );
}
