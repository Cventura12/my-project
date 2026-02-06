"use client";

import { UIObligationSummary } from "@/types/ui";
import { useSelection } from "./selection";

function formatDue(deadline: Date | null) {
  if (!deadline) return { primary: "No deadline", secondary: "" };
  const now = new Date();
  const ms = deadline.getTime() - now.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  const date = deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const primary = days >= 0 ? `Due in ${days} days` : `Overdue by ${Math.abs(days)} days`;
  return { primary, secondary: date };
}

function primaryChip(item: UIObligationSummary) {
  if (item.proofRequired && item.proofCount === 0) return "Proof missing";
  if (item.isBlocked) return "Blocked";
  if (item.status) return item.status.replaceAll("_", " ");
  return "Needs attention";
}

export default function NowCard({ item }: { item: UIObligationSummary }) {
  const { openDrawer } = useSelection();
  const due = formatDue(item.deadline);
  const chip = primaryChip(item);
  const cta = chip.toLowerCase().includes("proof") ? "Upload proof" : "Open";

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Now
          </p>
          <h2 className="mt-1 text-lg font-semibold text-black truncate">{item.title}</h2>
          <p className="text-sm text-muted-foreground mt-1 truncate">{item.schoolName}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-black font-medium">{due.primary}</div>
          {due.secondary && <div className="text-xs text-muted-foreground">{due.secondary}</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
          {chip}
        </span>
        <p className="text-muted-foreground">{item.reasonLine}</p>
      </div>

      <div className="mt-4">
        <button
          onClick={() => openDrawer(item.id)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white hover:bg-gray-800"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
