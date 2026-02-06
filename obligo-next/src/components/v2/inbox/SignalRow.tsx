"use client";

import { UISignal } from "@/types/ui";

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
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black truncate">{signal.subject}</p>
          <p className="text-xs text-gray-400 mt-1 truncate">{signal.from}</p>
        </div>
        <div className="text-xs text-gray-400">{relativeTime(signal.createdAt)}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        {signal.category && (
          <span className="px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
            {signal.category}
          </span>
        )}
        {signal.school && (
          <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
            {signal.school}
          </span>
        )}
        {signal.deadline && (
          <span className="px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
            {signal.deadline}
          </span>
        )}
        {conf && (
          <span className="px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
            {conf}
          </span>
        )}
      </div>

      {systemTake && (
        <p className="mt-2 text-xs text-gray-500">
          {systemTake}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-black hover:border-gray-400"
        >
          Open
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-black hover:border-gray-400"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
