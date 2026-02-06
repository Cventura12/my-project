"use client";

import { UIObligationSummary } from "@/types/ui";
import { useSelection } from "./selection";
import { BUTTON_LABELS, STATUS_LABELS } from "@/lib/copy";

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
  if (item.proofRequired && item.proofCount === 0) return STATUS_LABELS.proofMissing;
  if (item.isBlocked) return STATUS_LABELS.blocked;
  if (item.status === "pending") return STATUS_LABELS.pending;
  if (item.status === "submitted") return STATUS_LABELS.submitted;
  if (item.status === "verified") return STATUS_LABELS.verified;
  if (item.status === "failed") return STATUS_LABELS.failed;
  if (item.status === "blocked") return STATUS_LABELS.blocked;
  if (item.status) return item.status.replaceAll("_", " ");
  return "Needs attention";
}

export default function NowCard({ item }: { item: UIObligationSummary }) {
  const { openDrawer } = useSelection();
  const due = formatDue(item.deadline);
  const chip = primaryChip(item);
  const cta = chip.toLowerCase().includes("verification")
    ? BUTTON_LABELS.uploadProof
    : BUTTON_LABELS.reviewObligation;

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm hover:bg-muted/30 hover:border-border transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Now
          </p>
          <h2 className="mt-1 text-lg font-semibold text-black truncate">{item.title}</h2>
          <p className="text-sm text-muted-foreground mt-1 truncate">{item.schoolName}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-foreground font-medium">{due.primary}</div>
          {due.secondary && <div className="text-xs text-muted-foreground">{due.secondary}</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full border bg-amber-500/10 text-amber-800 border-amber-500/20">
          {chip}
        </span>
        <p className="text-muted-foreground">{item.reasonLine}</p>
      </div>

      <div className="mt-4">
        <button
          onClick={() => openDrawer(item.id)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
