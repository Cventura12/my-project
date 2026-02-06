"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getObligations } from "@/api/obligations";
import { toUIObligationSummary } from "@/adapters/obligationAdapter";
import { groupTodayObligations } from "@/lib/todayGrouping";
import { UIObligationSummary } from "@/types/ui";
import TodayHeader from "@/components/v2/TodayHeader";
import ObligationSection from "@/components/v2/ObligationSection";
import NowCard from "@/components/v2/NowCard";
import { ErrorState, Skeleton } from "@/components/ui/Page";
import { useAuth } from "@/lib/supabase/auth-provider";

export default function TodayPage() {
  const { user } = useAuth();
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

  const nowItem = groups.atRisk[0];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <TodayHeader items={items} />

      {nowItem && <NowCard item={nowItem} />}

      <ObligationSection title="At Risk" items={groups.atRisk} />
      <ObligationSection title="Blocked" items={groups.blocked} />
      <ObligationSection title="Unverified" items={groups.unverified} collapsible defaultCollapsed />
      <ObligationSection title="Everything Else" items={groups.other} collapsible defaultCollapsed />
    </div>
  );
}
