"use client";

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Inbox,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  FileCheck2,
  BellRing,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18),transparent_65%)]" />
        <div className="absolute -top-24 right-[-120px] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.12),transparent_65%)]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="text-sm font-semibold tracking-tight">Obligo</div>
        <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <span>Product</span>
          <span>Inbox</span>
          <span>Obligations</span>
          <span>Approvals</span>
          <span>Schools</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/login")}
            className="px-4 py-2 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:opacity-90"
          >
            Sign in
          </button>
          <button
            onClick={() => router.push("/signup")}
            className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold rounded-full border border-border/60 bg-background hover:bg-muted/40"
          >
            Sign up
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <h1
            className="mt-3 text-4xl sm:text-6xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "\"Playfair Display\", \"Georgia\", serif" }}
          >
            Turn obligations into action.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
            Obligo surfaces your most urgent financial aid tasks, proof gaps, and follow-ups
            so you can act in one place.
          </p>
          <div className="mt-8" />
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-4 h-4" /> Now
            </div>
            <div className="mt-3 text-sm font-semibold">Most urgent obligation</div>
            <p className="text-xs text-muted-foreground mt-1">
              Proof missing, due soon, and ready to resolve.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Inbox className="w-4 h-4" /> Signals Inbox
            </div>
            <div className="mt-3 text-sm font-semibold">Actionable email signals</div>
            <p className="text-xs text-muted-foreground mt-1">
              Extracted deadlines, schools, and proof clues—triaged for you.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardCheck className="w-4 h-4" /> Approvals
            </div>
            <div className="mt-3 text-sm font-semibold">Human‑in‑the‑loop follow‑ups</div>
            <p className="text-xs text-muted-foreground mt-1">
              Review draft outreach before anything is sent.
            </p>
          </div>
        </div>
      </section>

      {/* Feature stack */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-border/60 bg-background p-5 hover:bg-muted/30 hover:border-border transition-colors">
            <FileCheck2 className="w-5 h-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Obligations as source of truth</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Deadlines, proofs, and statuses live in one canonical checklist.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-5 hover:bg-muted/30 hover:border-border transition-colors">
            <BellRing className="w-5 h-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Risk surfaced early</h3>
            <p className="text-xs text-muted-foreground mt-1">
              At‑risk items stay visible until they are resolved.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-5 hover:bg-muted/30 hover:border-border transition-colors">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Proof-first compliance</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Track what is verified, missing, or blocked before submission.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
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
