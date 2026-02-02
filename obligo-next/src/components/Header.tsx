"use client";

import { HeaderProps } from "@/lib/types";

/**
 * Header Component - Mint & Black Theme
 *
 * Clean, high-contrast header with:
 * - Bold black Obligo branding
 * - Green accent for live status
 * - Transparent/mint background
 */

export default function Header({ lastUpdated }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-[#F0FDF4]/80 backdrop-blur-xl border-b-2 border-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Branding */}
          <div className="flex items-center gap-3">
            {/* Logo mark - Bold black with green accent */}
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center shadow-lg">
              <span className="text-emerald-400 font-bold text-xl">O</span>
            </div>

            {/* App name and tagline */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight tracking-tight">
                Obligo
              </h1>
              <p className="text-xs text-gray-500 leading-tight">
                AI-powered priority management
              </p>
            </div>
          </div>

          {/* Right side - Status */}
          <div className="flex items-center gap-4">
            {/* Last updated timestamp */}
            {lastUpdated && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border-2 border-gray-300">
                {/* Live indicator dot */}
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-600">
                  Updated {formatRelativeTime(lastUpdated)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Helper: Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}
