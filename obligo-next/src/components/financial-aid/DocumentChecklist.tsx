"use client";

import { Document } from "@/lib/hooks/useDocuments";
import { CheckCircle2, Clock, AlertCircle, Circle, FileWarning, ShieldCheck } from "lucide-react";

interface Props {
  documents: Document[];
  onUpdateStatus: (id: string, status: Document["status"]) => void;
  onSelectDocument: (doc: Document) => void;
}

const statusConfig: Record<Document["status"], { icon: any; color: string; bg: string; label: string }> = {
  not_started: { icon: Circle, color: "text-gray-400", bg: "bg-gray-50", label: "Not Started" },
  in_progress: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50", label: "In Progress" },
  submitted: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50", label: "Submitted" },
  received: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Received" },
  verified: { icon: ShieldCheck, color: "text-emerald-700", bg: "bg-emerald-50", label: "Verified" },
  issue: { icon: FileWarning, color: "text-red-600", bg: "bg-red-50", label: "Issue" },
};

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DocumentChecklist({ documents, onUpdateStatus, onSelectDocument }: Props) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No documents tracked yet. Add documents to start tracking.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {documents.map((doc) => {
        const config = statusConfig[doc.status];
        const Icon = config.icon;
        const daysUntil = getDaysUntil(doc.deadline);
        const isOverdue = daysUntil !== null && daysUntil < 0 && doc.status !== "received" && doc.status !== "verified";
        const isUrgent = daysUntil !== null && daysUntil <= 3 && daysUntil >= 0 && doc.status !== "received" && doc.status !== "verified";

        return (
          <button
            key={doc.id}
            onClick={() => onSelectDocument(doc)}
            className="w-full flex items-center gap-3 py-3 px-2 hover:bg-gray-50 transition-colors rounded-lg text-left"
          >
            <div className={`p-1.5 rounded-full ${config.bg}`}>
              <Icon className={`w-4 h-4 ${isOverdue ? "text-red-600" : config.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isOverdue ? "text-red-600" : "text-gray-900"}`}>
                  {doc.name}
                </span>
                {doc.type && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {doc.type}
                  </span>
                )}
              </div>
              {doc.description && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{doc.description}</p>
              )}
            </div>

            <div className="text-right shrink-0">
              {daysUntil !== null && (
                <span
                  className={`text-xs font-medium ${
                    isOverdue ? "text-red-600" : isUrgent ? "text-orange-600" : "text-gray-400"
                  }`}
                >
                  {isOverdue
                    ? `${Math.abs(daysUntil)}d overdue`
                    : daysUntil === 0
                    ? "Today"
                    : `${daysUntil}d left`}
                </span>
              )}
              <div className={`text-[10px] font-medium mt-0.5 ${config.color}`}>{config.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
