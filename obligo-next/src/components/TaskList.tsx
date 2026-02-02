"use client";

import { Inbox } from "lucide-react";
import TaskCard from "./TaskCard";
import { TaskListProps } from "@/lib/types";

/**
 * TaskList Component - Mint & Black Theme
 *
 * Renders the list of TaskCards or an empty state.
 * Features:
 * - Staggered animation for cards
 * - High-contrast empty state design
 * - Green accent for CTA text
 */

export default function TaskList({ obligations, onComplete }: TaskListProps) {
  // Empty State
  if (obligations.length === 0) {
    return (
      <div className="bg-white border-2 border-gray-800 rounded-xl p-12 text-center shadow-md">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gray-100 border-2 border-gray-300 flex items-center justify-center mx-auto mb-4">
          <Inbox className="w-8 h-8 text-gray-400" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          No Obligations Found
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Click <span className="text-emerald-600 font-semibold">&quot;Trigger Daily Check&quot;</span> to
          scan your email and calendar for commitments that need your attention.
        </p>
      </div>
    );
  }

  // Task List with staggered animation
  return (
    <div className="space-y-4">
      {obligations.map((obligation, index) => (
        <div
          key={obligation.id}
          className="animate-fade-in"
          style={{
            // Stagger the animation by 50ms per card
            animationDelay: `${index * 50}ms`,
            animationFillMode: "both",
          }}
        >
          <TaskCard
            obligation={obligation}
            onComplete={onComplete}
          />
        </div>
      ))}
    </div>
  );
}
