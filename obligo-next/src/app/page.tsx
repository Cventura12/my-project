"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Page";

export default function LandingPage() {
  const router = useRouter();

  const handleSeeHow = () => {
    const target = document.getElementById("mechanism");
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="text-sm font-semibold tracking-tight">Obligo</div>
        <Button variant="secondary" onClick={() => router.push("/login")}>
          Sign in
        </Button>
      </nav>

      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-12">
        <div className="max-w-3xl space-y-6">
          <h1
            className="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "\"Playfair Display\", \"Georgia\", serif" }}
          >
            Prevent silent administrative failure.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Obligo detects unstructured student obligations, verifies completion with proof, and
            escalates risk before administrative requirements quietly break your semester.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => router.push("/signup")}
              className="px-5 py-2.5">
              Get started
            </Button>
            <Button variant="secondary" onClick={handleSeeHow} className="px-5 py-2.5">
              See how it works
            </Button>
          </div>
        </div>
      </section>

      <section id="mechanism" className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What Obligo does
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-border/60 bg-background p-5">
            <h3 className="text-sm font-semibold text-foreground">Detect</h3>
            <p className="text-xs text-muted-foreground mt-2">
              Obligo scans emails, portals, and documents to surface obligations students do not explicitly track.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-5">
            <h3 className="text-sm font-semibold text-foreground">Verify</h3>
            <p className="text-xs text-muted-foreground mt-2">
              Submissions are not considered complete until confirmation or proof exists.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-5">
            <h3 className="text-sm font-semibold text-foreground">Escalate</h3>
            <p className="text-xs text-muted-foreground mt-2">
              Blocked, time-sensitive, and unverified obligations are surfaced before consequences occur.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-border/60 bg-background p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Irreversible example
          </div>
          <p className="mt-3 text-sm text-foreground">
            FAFSA marked "submitted" but never verified, federal aid revoked weeks later. Obligo
            blocks completion until confirmation exists.
          </p>
        </div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What Obligo is not
        </div>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>Obligo does not complete academic work.</li>
          <li>Obligo does not submit forms on your behalf.</li>
          <li>Obligo does not guess - verification is required.</li>
        </ul>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Who it is for
        </div>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>Students managing financial aid, applications, housing, and scholarships.</li>
          <li>Transfer, international, or high-stakes students.</li>
          <li>Anyone who has already been burned by a missed requirement.</li>
        </ul>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-2xl border border-border/60 bg-background p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Get started</div>
            <div className="text-xs text-muted-foreground">No credit card. No academic work touched.</div>
          </div>
          <Button variant="primary" onClick={() => router.push("/signup")} className="px-5 py-2.5">
            Get started
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>&copy; 2026 Obligo Inc.</p>
          <div className="flex items-center gap-4">
            <span>Security</span>
            <span>Privacy</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
