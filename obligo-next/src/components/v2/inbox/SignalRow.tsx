"use client";

import { UISignal } from "@/types/ui";
import { BUTTON_LABELS } from "@/lib/copy";
import { Badge, Button } from "@/components/ui/Page";

function relativeTime(iso?: string) {
  if (!iso) return "";
  const now = new Date();
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  const mins = Math.floor(ms / (1000 * 60));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function confidenceLabel(raw: any) {
  const conf = raw?.confidence;
  if (conf === null || conf === undefined) return null;
  if (conf >= 0.8) return "High";
  if (conf >= 0.5) return "Med";
  return "Low";
}

export default function SignalRow({
  signal,
  raw,
  onDismiss,
  onOpen,
}: {
  signal: UISignal;
  raw?: any;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const conf = confidenceLabel(raw);
  const systemTake = raw?.summary || raw?.action_needed || raw?.action || null;

  return (
    <div className="bg-background border border-border/60 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{signal.subject}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{signal.from}</p>
        </div>
        <div className="text-xs text-muted-foreground">{relativeTime(signal.createdAt)}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        {signal.category && (
          <Badge variant="neutral">{signal.category}</Badge>
        )}
        {signal.school && (
          <Badge variant="info">{signal.school}</Badge>
        )}
        {signal.deadline && (
          <Badge variant="warning">{signal.deadline}</Badge>
        )}
        {conf && (
          <Badge variant="neutral">{conf}</Badge>
        )}
      </div>

      {systemTake && (
        <p className="mt-2 text-xs text-muted-foreground">
          {systemTake}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Button onClick={onOpen} variant="secondary" size="sm">
          {BUTTON_LABELS.open}
        </Button>
        <Button onClick={onDismiss} variant="ghost" size="sm">
          {BUTTON_LABELS.dismiss}
        </Button>
      </div>
    </div>
  );
}
