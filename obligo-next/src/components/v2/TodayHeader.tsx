"use client";

import { useMemo } from "react";
import { UIObligationSummary } from "@/types/ui";

export default function TodayHeader({ items }: { items: UIObligationSummary[] }) {
  const counts = useMemo(() => {
    const base = { critical: 0, high: 0, normal: 0 };
    for (const item of items) {
      if (item.severity === "critical" || item.severity === "failed") base.critical += 1;
      else if (item.severity === "high") base.high += 1;
      else base.normal += 1;
    }
    return base;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Command Center
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Today</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full border bg-destructive/10 text-destructive border-destructive/20">
          {counts.critical} Critical
        </span>
        <span className="px-2 py-1 rounded-full border bg-amber-500/10 text-amber-700 border-amber-500/20">
          {counts.high} High
        </span>
        <span className="px-2 py-1 rounded-full border bg-muted text-muted-foreground border-border/60">
          {counts.normal} Normal
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Search (coming soon)"
            className="px-3 py-1.5 text-xs bg-muted/30 border border-border/60 rounded-lg text-muted-foreground opacity-80 cursor-not-allowed"
            disabled
            aria-disabled="true"
            tabIndex={-1}
          />
          <span className="px-2 py-1 rounded-full border bg-muted text-muted-foreground border-border/60">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
