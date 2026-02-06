"use client";

import { Card, PageTitle, SectionTitle } from "@/components/ui/Page";

export default function SchoolsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionTitle>Context</SectionTitle>
        <PageTitle>Schools</PageTitle>
      </div>
      <Card>
        <p className="text-sm text-gray-600">
          School context and document checklists will appear here.
        </p>
      </Card>
    </div>
  );
}
