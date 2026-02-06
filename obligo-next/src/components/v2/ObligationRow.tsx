"use client";

import { UIObligationSummary } from "@/types/ui";
import { useSelection } from "./selection";

function formatDeadline(deadline: Date | null) {
  if (!deadline) return { primary: "No deadline", secondary: "" };
  const now = new Date();
  const ms = deadline.getTime() - now.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  const date = deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const primary = days >= 0 ? `Due in ${days} days` : `Overdue by ${Math.abs(days)} days`;
  return { primary, secondary: date };
}

function primaryTruth(item: UIObligationSummary) {
  if (item.proofRequired && item.proofCount === 0) return "Proof missing";
  if (item.isBlocked) return "Blocked";
  if (item.status) return item.status.replaceAll("_", " ");
  return "Needs attention";
}

export default function ObligationRow({ item }: { item: UIObligationSummary }) {
  const { openDrawer } = useSelection();
  const due = formatDeadline(item.deadline);

  return (
    <button
      onClick={() => openDrawer(item.id)}
      className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-black truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{item.schoolName}</p>
        </div>
        <div className="text-right text-xs">
          <div className="text-black font-medium">{due.primary}</div>
          {due.secondary && <div className="text-muted-foreground">{due.secondary}</div>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
          {primaryTruth(item)}
        </span>
        <span className="text-muted-foreground truncate">{item.reasonLine}</span>
      </div>
    </button>
  );
}
