"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSchools } from "@/lib/hooks/useSchools";
import { useDocuments, Document } from "@/lib/hooks/useDocuments";
import { useFollowUps } from "@/lib/hooks/useFollowUps";
import DocumentChecklist from "@/components/financial-aid/DocumentChecklist";
import DocumentStatusModal from "@/components/financial-aid/DocumentStatusModal";
import AddDocumentForm from "@/components/financial-aid/AddDocumentForm";
import CriticalOblBar from "@/components/financial-aid/CriticalOblBar";
import { ArrowLeft, Trash2, FileText, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

// Phase 2 Step 2 BYPASS AUDIT:
// This page manages DOCUMENTS (paperwork tracking), not OBLIGATIONS (completion tracking).
// updateDocumentStatus() changes document status only. It does NOT transition obligation
// status. Obligation status transitions are gated by:
//   1. Dependency blockers (Phase 2 Step 1) — checked in financial-aid/page.tsx
//   2. Proof requirements (Phase 1 Step 3) — checked in financial-aid/page.tsx
//   3. Escalation blocking (Phase 1 Step 5) — checked in financial-aid/page.tsx
//   4. Database trigger enforce_obligation_dependencies — server-side safety net
//
// No obligation dependency bypass exists through this page.
export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;

  const { schools, deleteSchool } = useSchools();
  const { documents, addDocument, updateDocumentStatus, deleteDocument } = useDocuments(schoolId);
  const { createDraft, creating: drafting } = useFollowUps();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const handleDraftEmail = async (documentId: string) => {
    const result = await createDraft(schoolId, "follow_up", documentId);
    if (result) {
      setSelectedDoc(null);
      router.push("/financial-aid/approvals");
    }
  };

  const school = schools.find((s) => s.id === schoolId);

  // Stats
  const total = documents.length;
  const completed = documents.filter((d) => ["submitted", "received", "verified"].includes(d.status)).length;
  const pending = documents.filter((d) => ["not_started", "in_progress"].includes(d.status)).length;
  const issues = documents.filter((d) => d.status === "issue").length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleDeleteSchool = async () => {
    if (!confirm(`Delete ${school?.name} and all its documents?`)) return;
    await deleteSchool(schoolId);
    router.push("/financial-aid");
  };

  if (!school) {
    return (
      <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FDF4]">
      {/* Header */}
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <button
            onClick={() => router.push("/financial-aid")}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-black">{school.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-medium text-gray-400 uppercase">{school.application_type}</span>
              </div>
            </div>
            <button
              onClick={handleDeleteSchool}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Phase 3 Step 2: Cross-context visibility. */}
      <CriticalOblBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Progress */}
        {total > 0 && (
          <div className="bg-white border-2 border-black rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-black">Progress</h2>
              <span className="text-sm font-bold text-black">{progress}%</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm font-bold text-black">{total}</p>
                  <p className="text-[10px] text-gray-400">Total</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-bold text-emerald-600">{completed}</p>
                  <p className="text-[10px] text-gray-400">Done</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <div>
                  <p className="text-sm font-bold text-yellow-600">{pending}</p>
                  <p className="text-[10px] text-gray-400">Pending</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-bold text-red-600">{issues}</p>
                  <p className="text-[10px] text-gray-400">Issues</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document Checklist */}
        <div className="bg-white border-2 border-black rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Documents
          </h2>
          <DocumentChecklist
            documents={documents}
            onUpdateStatus={(id, status) => updateDocumentStatus(id, status)}
            onSelectDocument={(doc) => setSelectedDoc(doc)}
          />
          <AddDocumentForm schoolId={schoolId} onAdd={addDocument} />
        </div>
      </main>

      {/* Document modal */}
      {selectedDoc && (
        <DocumentStatusModal
          document={selectedDoc}
          onUpdateStatus={updateDocumentStatus}
          onClose={() => setSelectedDoc(null)}
          onDelete={deleteDocument}
          onDraftEmail={handleDraftEmail}
          drafting={drafting}
        />
      )}
    </div>
  );
}
