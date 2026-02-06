"use client";

import { Card, PageTitle, SectionTitle } from "@/components/ui/Page";

export default function ObligationsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionTitle>Canonical Work</SectionTitle>
        <PageTitle>Obligations</PageTitle>
      </div>
      <Card>
        <p className="text-sm text-gray-600">
          This page will list canonical obligations and their current state.
        </p>
      </Card>
    </div>
  );
}
