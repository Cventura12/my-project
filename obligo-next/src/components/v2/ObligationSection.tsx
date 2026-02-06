"use client";

import { useState } from "react";
import { UIObligationSummary } from "@/types/ui";
import ObligationRow from "./ObligationRow";
import SectionHeader from "./SectionHeader";
import { ChevronDown } from "lucide-react";

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
      <SectionHeader
        title={title}
        count={items.length}
        right={
          collapsible ? (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-black"
            >
              <span>{collapsed ? "Show" : "Hide"}</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`}
              />
            </button>
          ) : null
        }
      />

      {!collapsed && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              {title === "Blocked" ? "No blocked items." : "Nothing here yet."}
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-background divide-y">
              {items.map((item) => (
                <ObligationRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
