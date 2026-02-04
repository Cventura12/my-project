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

        return (
          <button
            key={doc.id}
            onClick={() => onSelectDocument(doc)}
            className="w-full flex items-center gap-3 py-3 px-2 hover:bg-gray-50 transition-colors rounded-lg text-left"
          >
            <div className={`p-1.5 rounded-full ${config.bg}`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
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
              <div className={`text-[10px] font-medium mt-0.5 ${config.color}`}>{config.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
