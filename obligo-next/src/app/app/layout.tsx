"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Page } from "@/components/ui/Page";
import { SelectionProvider, useSelection } from "@/components/v2/selection";
import ObligationDrawer from "@/components/v2/ObligationDrawer";
import { useAuth } from "@/lib/supabase/auth-provider";
import { NAV_LABELS } from "@/lib/copy";

const NAV_ITEMS = [
  { label: NAV_LABELS.today, href: "/app/today" },
  { label: NAV_LABELS.inbox, href: "/app/inbox" },
  { label: NAV_LABELS.obligations, href: "/app/obligations" },
  { label: NAV_LABELS.approvals, href: "/app/approvals" },
  { label: NAV_LABELS.schools, href: "/app/schools" },
  { label: NAV_LABELS.settings, href: "/app/settings" },
] as const;

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { selectedObligationId, closeDrawer } = useSelection();
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const activeHref = useMemo(() => {
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    return match?.href ?? "/app/today";
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            Obligo
          </Link>
          <Button
            onClick={() => setNavOpen((v) => !v)}
            variant="secondary"
            size="sm"
            className="md:hidden"
            aria-expanded={navOpen}
            aria-controls="app-nav"
          >
            Menu
          </Button>
          <nav id="app-nav" className="hidden md:flex items-center gap-2 text-xs">
            {NAV_ITEMS.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border border-border/60 hover:bg-muted/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={`md:hidden border-t border-border/60 ${navOpen ? "block" : "hidden"}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border border-border/60 hover:bg-muted/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <main>
        <Page>{children}</Page>
      </main>

      <ObligationDrawer
        userId={user?.id || null}
        obligationId={selectedObligationId}
        onClose={closeDrawer}
      />
    </div>
  );
}

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <SelectionProvider>
      <AppShellInner>{children}</AppShellInner>
    </SelectionProvider>
  );
}
