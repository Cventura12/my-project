"use client";

import { AnalyzedEmail } from "@/lib/hooks/useEmails";
import {
  Mail,
  AlertTriangle,
  Calendar,
  ExternalLink,
  X,
  GraduationCap,
  FileText,
  Clock,
  Info,
} from "lucide-react";

const relevanceColors: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  low: { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" },
  none: { bg: "bg-gray-50", text: "text-gray-400", border: "border-gray-100" },
};

const categoryIcons: Record<string, typeof Mail> = {
  financial_aid: GraduationCap,
  deadline: Calendar,
  document_request: FileText,
  status_update: Info,
  general: Mail,
};

function daysUntil(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${diff}d`;
}

interface EmailCardProps {
  email: AnalyzedEmail;
  onDismiss: (id: string) => void;
}

export default function EmailCard({ email, onDismiss }: EmailCardProps) {
  const colors = relevanceColors[email.relevance] || relevanceColors.low;
  const CategoryIcon = categoryIcons[email.category || "general"] || Mail;

  return (
    <div className={`bg-white border-2 border-black rounded-xl p-4 ${email.requires_action ? "" : "opacity-80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
            <CategoryIcon className={`w-4 h-4 ${colors.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            {/* Subject */}
            <h3 className="text-sm font-semibold text-black truncate">
              {email.subject || "(no subject)"}
            </h3>

            {/* Sender + date */}
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {email.sender} {email.received_at && `· ${new Date(email.received_at).toLocaleDateString()}`}
            </p>

            {/* AI Summary */}
            {email.summary && (
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                {email.summary}
              </p>
            )}

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {/* Relevance badge */}
              <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                {email.relevance}
              </span>

              {/* Category */}
              {email.category && (
                <span className="px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full">
                  {email.category.replace("_", " ")}
                </span>
              )}

              {/* School match */}
              {email.school_match && (
                <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" />
                  {email.school_match}
                </span>
              )}

              {/* Deadline */}
              {email.deadline && (
                <span className="px-2 py-0.5 text-[10px] font-medium text-orange-700 bg-orange-50 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {daysUntil(email.deadline)}
                </span>
              )}
            </div>

            {/* Action needed */}
            {email.action_needed && email.requires_action && (
              <div className="mt-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">{email.action_needed}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {email.source_link && (
            <a
              href={email.source_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
              title="Open in Gmail"
            >
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </a>
          )}
          <button
            onClick={() => onDismiss(email.id)}
            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
