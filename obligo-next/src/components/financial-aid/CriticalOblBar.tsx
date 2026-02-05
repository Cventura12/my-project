"use client";

/**
 * PHASE 3 STEP 2 — Cross-Context Visibility
 *
 * This component renders a condensed bar showing critical and failed obligations.
 * It appears on EVERY main screen (emails, approvals, school detail).
 *
 * PURPOSE:
 * Critical obligations must be impossible to overlook, even when the user
 * is on a different page. This bar ensures they cannot navigate away from
 * awareness of critical state.
 *
 * DESIGN:
 * - Not a notification. Not dismissable. Not animated.
 * - A persistent, factual bar that states what is critical/failed.
 * - Links back to the dashboard where action can be taken.
 * - Failed and critical are shown separately if both exist.
 *
 * GUARDRAILS:
 * - No advice. No suggestions. Just "X obligations are critical/failed."
 * - Cannot be hidden by filters.
 * - Cannot be dismissed.
 * - No AI. Pure state check.
 */

import { useObligations } from "@/lib/hooks/useObligations";
import { computeSeverity, type SeverityLevel } from "@/lib/severity";
import { XOctagon, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function CriticalOblBar() {
  const { obligations, loading } = useObligations();

  if (loading || obligations.length === 0) return null;

  // Compute severity for each non-verified obligation
  const counts: Record<SeverityLevel, number> = {
    normal: 0,
    elevated: 0,
    high: 0,
    critical: 0,
    failed: 0,
  };

  for (const obl of obligations) {
    if (obl.status === "verified") continue;
    const sev = computeSeverity({
      status: obl.status,
      deadline: obl.deadline,
      stuck: obl.stuck ?? false,
    });
    counts[sev.level]++;
  }

  const failedCount = counts.failed;
  const criticalCount = counts.critical;

  // Nothing to show
  if (failedCount === 0 && criticalCount === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6">
      {failedCount > 0 && (
        <Link href="/financial-aid" className="block">
          <div className="bg-red-700 border-2 border-red-900 rounded-lg px-4 py-2.5 mt-4 flex items-center gap-2.5 hover:bg-red-800 transition-colors">
            <XOctagon className="w-4 h-4 text-white shrink-0" />
            <p className="text-xs text-white font-bold">
              {failedCount} obligation{failedCount > 1 ? "s" : ""} failed.
              <span className="font-medium text-red-200 ml-1">Deadline passed without verification.</span>
            </p>
          </div>
        </Link>
      )}
      {criticalCount > 0 && (
        <Link href="/financial-aid" className="block">
          <div className="bg-red-50 border-2 border-red-300 rounded-lg px-4 py-2.5 mt-3 flex items-center gap-2.5 hover:bg-red-100 transition-colors">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-xs text-red-700 font-bold">
              {criticalCount} obligation{criticalCount > 1 ? "s" : ""} critical.
              <span className="font-medium text-red-500 ml-1">Stuck with imminent deadline.</span>
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}
