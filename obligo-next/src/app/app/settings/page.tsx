"use client";

import { useRouter } from "next/navigation";
import { Card, SectionHeader, Button } from "@/components/ui/Page";
import { DOCTRINE, NAV_LABELS } from "@/lib/copy";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={NAV_LABELS.settings}
        subtitle="Account, notifications, and integrations will live here."
      />
      <Card>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">About</h3>
          <p className="text-sm text-muted-foreground">{DOCTRINE}</p>
        </div>
      </Card>
      <Card>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Legacy</h3>
          <p className="text-sm text-muted-foreground">
            Need the old experience? Open the legacy dashboard here.
          </p>
          <Button variant="secondary" onClick={() => router.push("/financial-aid")}
            className="w-fit">
            Open legacy dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
