"use client";

import { useState } from "react";
import { UIObligationSummary } from "@/types/ui";
import ObligationRow from "./ObligationRow";
import { Button, EmptyState, SectionHeader } from "@/components/ui/Page";
import { ChevronDown } from "lucide-react";
import { EMPTY_STATES, STATUS_LABELS } from "@/lib/copy";

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
        size="section"
        title={title}
        count={items.length}
        right={
          collapsible ? (
            <Button
              onClick={() => setCollapsed((v) => !v)}
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1"
            >
              <span>{collapsed ? "Show" : "Hide"}</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`}
              />
            </Button>
          ) : null
        }
      />

      {!collapsed && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <EmptyState>
              {title === STATUS_LABELS.blocked ? EMPTY_STATES.blocked : "Nothing here yet."}
            </EmptyState>
          ) : (
            <div className="rounded-lg border border-border/60 bg-background divide-y">
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
