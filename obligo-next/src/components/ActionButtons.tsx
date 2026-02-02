"use client";

import { RefreshCw, Zap, Download } from "lucide-react";
import { ActionButtonsProps } from "@/lib/types";

/**
 * ActionButtons Component - Mint & Black Theme
 *
 * Primary action bar featuring:
 * - Refresh: White card with dark border
 * - Trigger Daily Check: Bold green primary CTA
 * - Export: Ghost style with border on hover
 */

export default function ActionButtons({
  onRefresh,
  onTriggerCheck,
  onExport,
  isLoading = false,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Refresh Button - White with dark border */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="btn-secondary focus-ring"
        aria-label="Refresh obligations"
      >
        <RefreshCw
          className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
        />
        <span>Refresh</span>
      </button>

      {/* Trigger Daily Check - Green primary CTA */}
      <button
        onClick={onTriggerCheck}
        disabled={isLoading}
        className="btn-primary focus-ring"
        aria-label="Trigger AI daily check"
      >
        <Zap className={`w-4 h-4 ${isLoading ? "animate-pulse" : ""}`} />
        <span>{isLoading ? "Scanning..." : "Trigger Daily Check"}</span>
      </button>

      {/* Export Button - Ghost style */}
      <button
        onClick={onExport}
        disabled={isLoading}
        className="btn-ghost focus-ring"
        aria-label="Export obligations"
      >
        <Download className="w-4 h-4" />
        <span>Export</span>
      </button>
    </div>
  );
}
