"use client";

import Drawer from "@/components/Drawer";
import { UISignal } from "@/types/ui";
import { BUTTON_LABELS } from "@/lib/copy";
import { Badge, Button } from "@/components/ui/Page";

export default function SignalDrawer({
  signal,
  rawSignal,
  onClose,
  onDismiss,
  onAttachProof,
}: {
  signal: UISignal | null;
  rawSignal?: any;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onAttachProof: (signalId: string, obligationId: string) => void;
}) {
  const open = !!signal;
  if (!signal) {
    return <Drawer isOpen={false} onClose={onClose} title="Signal" />;
  }

  const canAttachProof = true;

  return (
    <Drawer isOpen={open} onClose={onClose} title="Signal Detail">
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{signal.subject}</h2>
          <p className="text-xs text-muted-foreground mt-1">{signal.from}</p>
          {signal.createdAt && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(signal.createdAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="bg-background border border-border/60 rounded-lg p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Type: {signal.category || "-"}</Badge>
            <Badge variant="info">School: {signal.school || "-"}</Badge>
            <Badge variant="warning">Deadline: {signal.deadline || "-"}</Badge>
            <Badge variant="neutral">Confidence: {rawSignal?.confidence ?? "-"}</Badge>
          </div>
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer text-muted-foreground">Raw snippet / analysis</summary>
          <div className="mt-2 space-y-2">
            {rawSignal?.snippet && <p>{rawSignal.snippet}</p>}
            {rawSignal?.summary && <p>{rawSignal.summary}</p>}
            {rawSignal?.action_needed && <p>{rawSignal.action_needed}</p>}
          </div>
        </details>

        <div className="flex items-center gap-2 text-xs">
          <Button onClick={() => onDismiss(signal.id)} variant="ghost" size="sm">
            {BUTTON_LABELS.dismiss}
          </Button>
          {canAttachProof && (
            <Button
              onClick={() => {
                const obligationId = (
                  prompt("Obligation ID to attach this signal as proof:", "") || ""
                ).trim();
                if (obligationId) onAttachProof(signal.id, obligationId);
              }}
              variant="secondary"
              size="sm"
            >
              {BUTTON_LABELS.uploadProof}
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
