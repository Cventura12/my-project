"use client";

import { useState } from "react";
import { Check, ChevronDown, Zap, AlertCircle, ExternalLink, HelpCircle } from "lucide-react";
import { TaskCardProps, Priority } from "@/lib/types";

/**
 * TaskCard Component - Mint & Black Theme
 *
 * High-contrast task card with:
 * - White background with 2px dark border
 * - 6px colored left border based on priority
 * - Priority score badge (circle with colored background)
 * - Smooth expand/collapse animation
 * - Hover lift effect
 */

export default function TaskCard({ obligation, onComplete }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActionPath, setShowActionPath] = useState(false);

  // Get all styling based on priority
  const styles = getPriorityStyles(obligation.priority);

  // Handle opening the source link
  const handleOpenSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (obligation.sourceLink) {
      window.open(obligation.sourceLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={`
        task-card
        ${styles.borderClass}
        ${obligation.priority === "urgent" ? "pulse-urgent" : ""}
      `}
    >
      {/* Main Row - Always Visible */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-4 p-5 cursor-pointer"
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete(obligation.id);
          }}
          className={`
            w-6 h-6 rounded-md flex-shrink-0
            border-2 border-gray-800
            hover:border-emerald-500 hover:bg-emerald-50
            flex items-center justify-center
            transition-all duration-200
            focus-ring
          `}
          aria-label="Mark as complete"
        >
          <Check className="w-4 h-4 text-transparent hover:text-emerald-500" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-base font-semibold text-gray-900 leading-tight">
            {obligation.title}
          </h3>

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Due Date */}
            <span className={`text-sm font-semibold ${styles.textClass}`}>
              {obligation.dueDate}
            </span>

            {/* Separator */}
            <span className="text-gray-300">|</span>

            {/* Context */}
            <span className="text-sm text-gray-500">
              {obligation.context}
            </span>

            {/* Status Badge - Only for urgent/blocking */}
            {obligation.priority !== "normal" && (
              <span
                className={`
                  text-[10px] font-bold uppercase tracking-wider
                  px-2.5 py-1 rounded-md
                  border-2
                  ${styles.badgeClass}
                `}
              >
                {obligation.priority}
              </span>
            )}
          </div>
        </div>

        {/* Right Side - Score & Expand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Priority Score Badge - Circle */}
          <div
            className={`
              w-12 h-12 rounded-full flex items-center justify-center
              font-bold text-base text-white
              ${styles.scoreClass}
              shadow-lg
            `}
          >
            {obligation.priorityScore}
          </div>

          {/* Expand/Collapse Arrow */}
          <ChevronDown
            className={`
              w-5 h-5 text-gray-400
              transition-transform duration-200 ease-out
              ${isExpanded ? "rotate-180" : ""}
            `}
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-fade-in border-t-2 border-gray-200">
          <div className="p-5 pl-16 space-y-4 bg-gray-50">
            {/* Action Buttons */}
            <div className="flex gap-3 mb-4">
              {/* Primary Action: Open */}
              {obligation.sourceLink && (
                <button
                  onClick={handleOpenSource}
                  className="
                    flex items-center gap-2
                    px-4 py-2 rounded-lg
                    bg-gray-900 text-white
                    font-semibold text-sm
                    hover:bg-gray-800
                    transition-colors duration-200
                    border-2 border-gray-900
                    focus-ring
                  "
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </button>
              )}

              {/* Secondary Action: Show Action Path */}
              {obligation.actionPath && obligation.actionPath.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActionPath(!showActionPath);
                  }}
                  className="
                    flex items-center gap-2
                    px-4 py-2 rounded-lg
                    bg-white text-gray-700
                    font-medium text-sm
                    hover:bg-gray-100
                    transition-colors duration-200
                    border-2 border-gray-300
                    focus-ring
                  "
                >
                  <HelpCircle className="w-4 h-4" />
                  What do I do first?
                </button>
              )}
            </div>

            {/* Action Path - Collapsible */}
            {showActionPath && obligation.actionPath && (
              <div className="bg-white border-2 border-gray-300 rounded-lg p-4 mb-4">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Action Path
                </p>
                <ol className="space-y-2">
                  {obligation.actionPath.map((step, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="
                        flex-shrink-0 w-6 h-6 rounded-full
                        bg-emerald-100 text-emerald-700
                        font-bold text-sm
                        flex items-center justify-center
                        border-2 border-emerald-300
                      ">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-6">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Quick Action */}
            <div className="flex gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 self-start border-2 border-emerald-200">
                <Zap className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Quick Action
                </p>
                <p className="text-sm text-gray-700 font-medium">
                  {obligation.quickAction}
                </p>
              </div>
            </div>

            {/* Why It Matters */}
            <div className="flex gap-3">
              <div className="p-2 rounded-lg bg-gray-200 self-start border-2 border-gray-300">
                <AlertCircle className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Why It Matters
                </p>
                <p className="text-sm text-gray-600">
                  {obligation.whyItMatters}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get all styling classes based on priority level
 */
function getPriorityStyles(priority: Priority) {
  const styles = {
    urgent: {
      borderClass: "priority-border-urgent",
      textClass: "text-red-500",
      badgeClass: "bg-red-50 text-red-600 border-red-300",
      scoreClass: "bg-red-500",
    },
    blocking: {
      borderClass: "priority-border-blocking",
      textClass: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-600 border-amber-300",
      scoreClass: "bg-amber-500",
    },
    normal: {
      borderClass: "priority-border-normal",
      textClass: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-600 border-emerald-300",
      scoreClass: "bg-emerald-500",
    },
  };

  return styles[priority];
}
