"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Page } from "@/components/ui/Page";
import { SelectionProvider, useSelection } from "@/components/v2/selection";
import ObligationDrawer from "@/components/v2/ObligationDrawer";
import { useAuth } from "@/lib/supabase/auth-provider";

const NAV_ITEMS = [
  { label: "Today", href: "/app/today" },
  { label: "Inbox", href: "/app/inbox" },
  { label: "Obligations", href: "/app/obligations" },
  { label: "Approvals", href: "/app/approvals" },
  { label: "Schools", href: "/app/schools" },
  { label: "Settings", href: "/app/settings" },
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
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-black text-xs">
              O
            </div>
            <div>
              <p className="text-[10px] tracking-widest font-semibold text-gray-400 uppercase">Obligo</p>
              <p className="text-sm font-bold text-black">App v2</p>
            </div>
          </div>
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="md:hidden px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700"
            aria-expanded={navOpen}
            aria-controls="app-nav"
          >
            Menu
          </button>
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
