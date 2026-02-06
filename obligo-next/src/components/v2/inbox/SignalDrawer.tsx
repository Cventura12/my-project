"use client";

import Drawer from "@/components/Drawer";
import { UISignal } from "@/types/ui";

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
          <h2 className="text-sm font-semibold text-black">{signal.subject}</h2>
          <p className="text-xs text-gray-400 mt-1">{signal.from}</p>
          {signal.createdAt && (
            <p className="text-xs text-gray-500 mt-1">
              {new Date(signal.createdAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <div>Type: {signal.category || "—"}</div>
          <div>School: {signal.school || "—"}</div>
          <div>Deadline: {signal.deadline || "—"}</div>
          <div>Confidence: {rawSignal?.confidence ?? "—"}</div>
        </div>

        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer text-gray-500">Raw snippet / analysis</summary>
          <div className="mt-2 space-y-2">
            {rawSignal?.snippet && <p>{rawSignal.snippet}</p>}
            {rawSignal?.summary && <p>{rawSignal.summary}</p>}
            {rawSignal?.action_needed && <p>{rawSignal.action_needed}</p>}
          </div>
        </details>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => onDismiss(signal.id)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-black hover:border-black"
          >
            Dismiss
          </button>
          {canAttachProof && (
            <button
              onClick={() => {
                const obligationId = (prompt("Obligation ID to attach this signal as proof:", "") || "").trim();
                if (obligationId) onAttachProof(signal.id, obligationId);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-black hover:border-black"
            >
              Attach as proof
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
