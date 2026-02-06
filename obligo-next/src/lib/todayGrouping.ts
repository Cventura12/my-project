"use client";

import { UIObligationSummary } from "@/types/ui";

export interface TodayGroups {
  atRisk: UIObligationSummary[];
  blocked: UIObligationSummary[];
  unverified: UIObligationSummary[];
  other: UIObligationSummary[];
}

function isWithinDays(date: Date, days: number) {
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  return ms <= days * 24 * 60 * 60 * 1000;
}

export function groupTodayObligations(items: UIObligationSummary[]): TodayGroups {
  const groups: TodayGroups = {
    atRisk: [],
    blocked: [],
    unverified: [],
    other: [],
  };

  for (const item of items) {
    const deadlineRisk =
      item.deadline ? isWithinDays(item.deadline, 7) && item.status !== "verified" : false;
    const proofMissing = item.proofRequired && item.proofCount === 0;

    const isAtRisk =
      item.severity === "high" ||
      item.severity === "critical" ||
      item.severity === "failed" ||
      deadlineRisk ||
      item.status === "failed" ||
      (item.status === "submitted" && proofMissing);

    const isBlocked =
      item.isBlocked ||
      item.status === "blocked" ||
      !!item.blockedBySummary ||
      item.stuck;

    const isUnverified =
      item.status === "submitted" ||
      (item.proofRequired && item.proofCount === 0);

    if (isAtRisk) {
      groups.atRisk.push(item);
    } else if (isBlocked) {
      groups.blocked.push(item);
    } else if (isUnverified) {
      groups.unverified.push(item);
    } else {
      groups.other.push(item);
    }
  }

  return groups;
}
