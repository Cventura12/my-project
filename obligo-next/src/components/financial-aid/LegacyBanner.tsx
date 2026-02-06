"use client";

import Link from "next/link";

export default function LegacyBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs">
        <span>You&apos;re viewing Legacy.</span>
        <Link href="/app/today" className="font-semibold hover:underline">
          Go to the new app
        </Link>
      </div>
    </div>
  );
}
