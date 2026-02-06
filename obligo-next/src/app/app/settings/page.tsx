"use client";

import Link from "next/link";
import { Card, PageTitle, SectionTitle } from "@/components/ui/Page";
import { DOCTRINE, NAV_LABELS } from "@/lib/copy";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionTitle>Preferences</SectionTitle>
        <PageTitle>{NAV_LABELS.settings}</PageTitle>
      </div>
      <Card>
        <p className="text-sm text-gray-600">
          Account, notifications, and integrations will live here.
        </p>
      </Card>
      <Card>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">About</h3>
          <p className="text-sm text-gray-600">{DOCTRINE}</p>
        </div>
      </Card>
      <Card>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Legacy</h3>
          <p className="text-sm text-gray-600">
            Need the old experience? Open the legacy dashboard here.
          </p>
          <Link
            href="/financial-aid"
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            Open legacy dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
