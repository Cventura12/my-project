"use client";

import { UIObligationSummary } from "@/types/ui";
import { useSelection } from "./selection";

function formatDeadline(deadline: Date | null) {
  if (!deadline) return "No deadline";
  return deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function badgeClass(color: "gray" | "yellow" | "orange" | "red" | "emerald") {
  const map = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    orange: "bg-orange-100 text-orange-800 border-orange-400",
    red: "bg-red-100 text-red-800 border-red-400",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  return map[color];
}

export default function ObligationRow({ item }: { item: UIObligationSummary }) {
  const { openDrawer } = useSelection();

  const severityColor =
    item.severity === "critical" || item.severity === "failed"
      ? "red"
      : item.severity === "high"
      ? "orange"
      : item.severity === "elevated"
      ? "yellow"
      : "gray";

  return (
    <button
      onClick={() => openDrawer(item.id)}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black truncate">{item.title}</p>
          <p className="text-xs text-gray-400 mt-1">{item.schoolName}</p>
        </div>
        <div className="text-xs text-gray-600">{formatDeadline(item.deadline)}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass(severityColor)}`}>
          {item.severity.toUpperCase()}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-gray-100 text-gray-700 border-gray-200">
          {item.status.toUpperCase()}
        </span>
        {item.isBlocked && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-50 text-red-700 border-red-200">
            BLOCKED
          </span>
        )}
        {item.proofRequired && item.proofCount === 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
            PROOF MISSING
          </span>
        )}
        {item.stuck && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-purple-50 text-purple-700 border-purple-200">
            STUCK
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500">{item.reasonLine}</p>
    </button>
  );
}
