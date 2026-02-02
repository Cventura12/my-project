"use client";

import { useRouter } from "next/navigation";
import { GraduationCap, FileText, Bell, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F0FDF4]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white font-bold">O</span>
          </div>
          <span className="text-lg font-bold text-black">Obligo</span>
        </div>
        <button
          onClick={() => router.push("/login")}
          className="px-5 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-black leading-tight">
          Never miss a deadline again.
        </h1>
        <p className="text-lg text-gray-500 mt-4 max-w-xl mx-auto">
          Track every financial aid document, deadline, and requirement across all your schools. One dashboard. Zero chaos.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={() => router.push("/signup")}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border-2 border-black rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-black">School Tracking</h3>
            <p className="text-sm text-gray-500 mt-1">
              Add your schools. See every document requirement at a glance.
            </p>
          </div>
          <div className="bg-white border-2 border-black rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-black">Document Checklist</h3>
            <p className="text-sm text-gray-500 mt-1">
              FAFSA, tax returns, transcripts. Track status for every document.
            </p>
          </div>
          <div className="bg-white border-2 border-black rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4">
              <Bell className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-black">Deadline Alerts</h3>
            <p className="text-sm text-gray-500 mt-1">
              Overdue items surface automatically. No more missed deadlines.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs text-gray-400">&copy; 2026 Obligo Inc.</p>
        </div>
      </footer>
    </div>
  );
}
