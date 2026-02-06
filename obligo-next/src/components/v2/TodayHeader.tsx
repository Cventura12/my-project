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
        <h1 className="text-3xl font-semibold tracking-tight text-black">Today</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
          {counts.critical} Critical
        </span>
        <span className="px-2 py-1 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
          {counts.high} High
        </span>
        <span className="px-2 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">
          {counts.normal} Normal
        </span>
      </div>
    </div>
  );
}
