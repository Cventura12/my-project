"use client";

import { useState } from "react";
import { UIObligationSummary } from "@/types/ui";
import ObligationRow from "./ObligationRow";

export default function ObligationSection({
  title,
  items,
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  items: UIObligationSummary[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        {collapsible && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-xs text-gray-500 hover:text-black"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-500 text-center">
              Nothing here yet.
            </div>
          ) : (
            items.map((item) => <ObligationRow key={item.id} item={item} />)
          )}
        </div>
      )}
    </section>
  );
}
