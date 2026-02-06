"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { getObligations } from "@/api/obligations";
import { toUIObligationSummary } from "@/adapters/obligationAdapter";
import { groupTodayObligations } from "@/lib/todayGrouping";
import { UIObligationSummary } from "@/types/ui";
import { Badge, Button, EmptyState, ErrorState, SectionHeader, Skeleton } from "@/components/ui/Page";
import { useAuth } from "@/lib/supabase/auth-provider";
import { EMPTY_STATES, STATUS_LABELS, BUTTON_LABELS } from "@/lib/copy";
import { useSelection } from "@/components/v2/selection";

export default function TodayPage() {
  const { user } = useAuth();
  const { openDrawer } = useSelection();
  const [items, setItems] = useState<UIObligationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayItems, setDisplayItems] = useState<UIObligationSummary[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevPositions = useRef<Map<string, DOMRect>>(new Map());
  const prevTopRef = useRef<UIObligationSummary[]>([]);
  const exitingIds = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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

  useEffect(() => {
    const prev = prevTopRef.current;
    prevTopRef.current = topThree;
    const prevIds = new Set(prev.map((item) => item.id));
    const nextIds = new Set(topThree.map((item) => item.id));
    const removedIds = Array.from(prevIds).filter((id) => !nextIds.has(id));

    if (removedIds.length === 0) {
      exitingIds.current = new Set();
      setDisplayItems(topThree);
    } else {
      exitingIds.current = new Set(removedIds);
      const removedItems = prev.filter((item) => removedIds.includes(item.id));
      setDisplayItems([...topThree, ...removedItems]);
      if (reducedMotion) {
        exitingIds.current = new Set();
        setDisplayItems(topThree);
      } else {
        const timer = setTimeout(() => {
          exitingIds.current = new Set();
          setDisplayItems(topThree);
        }, 220);
        return () => clearTimeout(timer);
      }
    }

  }, [topThree, reducedMotion]);

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-item-id]"));
    const newPositions = new Map<string, DOMRect>();

    elements.forEach((el) => {
      const id = el.dataset.itemId;
      if (!id) return;
      newPositions.set(id, el.getBoundingClientRect());
    });

    if (!reducedMotion) {
      elements.forEach((el) => {
        const id = el.dataset.itemId;
        if (!id || exitingIds.current.has(id)) return;
        const prev = prevPositions.current.get(id);
        const next = newPositions.get(id);
        if (!prev || !next) return;
        const dy = prev.top - next.top;
        if (dy) {
          gsap.fromTo(
            el,
            { y: dy },
            { y: 0, duration: 0.25, ease: "power1.out" }
          );
        }
      });

      exitingIds.current.forEach((id) => {
        const el = elements.find((node) => node.dataset.itemId === id);
        if (!el) return;
        gsap.to(el, {
          height: 0,
          opacity: 0,
          marginTop: 0,
          marginBottom: 0,
          paddingTop: 0,
          paddingBottom: 0,
          duration: 0.2,
          ease: "power1.in",
        });
      });
    }

    prevPositions.current = newPositions;
  }, [displayItems, reducedMotion]);

  const bySeverity = useMemo(() => {
    const critical: UIObligationSummary[] = [];
    const high: UIObligationSummary[] = [];
    const normal: UIObligationSummary[] = [];
    for (const item of displayItems) {
      if (item.severity === "critical" || item.severity === "failed") critical.push(item);
      else if (item.severity === "high") high.push(item);
      else normal.push(item);
    }
    return { critical, high, normal };
  }, [displayItems]);

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

  const badgeVariant = (item: UIObligationSummary) => {
    if (item.proofRequired && item.proofCount === 0) return "proof";
    if (item.status === "blocked" || item.isBlocked) return "blocked";
    if (item.status === "failed") return "critical";
    return "neutral";
  };

  const renderItem = (item: UIObligationSummary) => {
    const isExiting = exitingIds.current.has(item.id);
    return (
      <div
        key={item.id}
        data-item-id={item.id}
        className="border border-border/60 rounded-lg p-5 space-y-3 overflow-hidden"
        data-exiting={isExiting ? "true" : "false"}
      >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">{item.title}</h3>
          <div className="mt-2">
            <Badge variant={badgeVariant(item)}>{statusLabel(item)}</Badge>
          </div>
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
      <Button onClick={() => openDrawer(item.id)} variant="primary">
        {actionLabel(item)}
      </Button>
    </div>
    );
  };

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
      <SectionHeader
        title="Today"
        subtitle="These items require attention to prevent administrative failure."
      />

      {displayItems.length === 0 && (
        <EmptyState>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{EMPTY_STATES.today}</p>
        </EmptyState>
      )}

      <div ref={listRef} className="space-y-6">
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
    </div>
  );
}
