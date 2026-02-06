"use client";

import { EmptyState, SectionHeader } from "@/components/ui/Page";
import { EMPTY_STATES, NAV_LABELS } from "@/lib/copy";

export default function ObligationsPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title={NAV_LABELS.obligations}
        subtitle="Canonical obligations and verification state."
      />
      <EmptyState>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {EMPTY_STATES.obligations}
        </p>
      </EmptyState>
    </div>
  );
}
