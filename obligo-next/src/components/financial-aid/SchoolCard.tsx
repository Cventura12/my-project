"use client";

import Link from "next/link";
import { School } from "@/lib/hooks/useSchools";
import { Document } from "@/lib/hooks/useDocuments";
import { ChevronRight, AlertTriangle } from "lucide-react";

interface Props {
  school: School;
  documents: Document[];
}

export default function SchoolCard({ school, documents }: Props) {
  const total = documents.length;
  const completed = documents.filter((d) => ["received", "verified", "submitted"].includes(d.status)).length;
  const issues = documents.filter((d) => d.status === "issue").length;
  // Phase 1 doctrine: deadlines/overdue are canonical in `obligations`, not `documents`.
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link
      href={`/financial-aid/${school.id}`}
      className="block bg-white border-2 border-black rounded-xl p-5 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-black">{school.name}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-medium text-gray-400 uppercase">{school.application_type}</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 mt-1" />
      </div>

      {total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500">
              {completed} of {total} documents
            </span>
            <span className="font-medium text-black">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {issues > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-xs text-red-600 font-medium">
            {issues} with issues
          </span>
        </div>
      )}

      {total === 0 && (
        <p className="mt-3 text-xs text-gray-400">No documents tracked yet</p>
      )}
    </Link>
  );
}
