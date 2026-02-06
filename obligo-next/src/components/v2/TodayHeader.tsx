"use client";

import { useMemo } from "react";
import { PageTitle, SectionTitle } from "@/components/ui/Page";
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
        <SectionTitle>Command Center</SectionTitle>
        <PageTitle>Today</PageTitle>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full border bg-red-100 text-red-800 border-red-300">
          {counts.critical} Critical
        </span>
        <span className="px-2 py-1 rounded-full border bg-orange-100 text-orange-800 border-orange-300">
          {counts.high} High
        </span>
        <span className="px-2 py-1 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
          {counts.normal} Normal
        </span>
        <input
          type="text"
          placeholder="Search (coming soon)"
          className="ml-auto px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-black"
          disabled
        />
      </div>
    </div>
  );
}
