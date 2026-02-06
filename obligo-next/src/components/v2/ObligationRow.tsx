"use client";

import { UIObligationSummary } from "@/types/ui";
import { useSelection } from "./selection";
import { STATUS_LABELS } from "@/lib/copy";
import { Badge, Button } from "@/components/ui/Page";

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

export default function ObligationRow({ item }: { item: UIObligationSummary }) {
  const { openDrawer } = useSelection();
  const due = formatDeadline(item.deadline);

  return (
    <Button
      onClick={() => openDrawer(item.id)}
      variant="ghost"
      className="w-full text-left px-4 py-3 justify-start"
    >
      <div className="flex items-start justify-between gap-4 w-full">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{item.schoolName}</p>
        </div>
        <div className="text-right text-xs">
          <div className="text-foreground font-medium">{due.primary}</div>
          {due.secondary && <div className="text-muted-foreground">{due.secondary}</div>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="proof">{primaryTruth(item)}</Badge>
        <span className="text-muted-foreground truncate">{item.reasonLine}</span>
      </div>
    </Button>
  );
}
