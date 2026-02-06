"use client";

import { Card, PageTitle, SectionTitle } from "@/components/ui/Page";
import { EMPTY_STATES, NAV_LABELS } from "@/lib/copy";

export default function ObligationsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionTitle>Canonical Work</SectionTitle>
        <PageTitle>{NAV_LABELS.obligations}</PageTitle>
      </div>
      <Card>
        <p className="text-sm text-gray-600 whitespace-pre-line">{EMPTY_STATES.obligations}</p>
      </Card>
    </div>
  );
}
