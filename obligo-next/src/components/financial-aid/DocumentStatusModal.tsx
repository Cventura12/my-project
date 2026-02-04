"use client";

import { useState } from "react";
import { Document } from "@/lib/hooks/useDocuments";
import { X, Mail, Loader2 } from "lucide-react";

interface Props {
  document: Document;
  onUpdateStatus: (id: string, status: Document["status"], extra?: { notes?: string }) => Promise<boolean>;
  onClose: () => void;
  onDelete: (id: string) => Promise<boolean>;
  onDraftEmail?: (documentId: string) => Promise<void>;
  drafting?: boolean;
}

const statuses: { value: Document["status"]; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  // Phase 1 Step 3 (Credibility): "received"/"verified" are optimistic and are BLOCKED.
  // Proof must be attached to the linked canonical `obligations` row before verification.
  //
  // Phase 2 Step 2 BYPASS AUDIT:
  // Document status is SEPARATE from obligation status. Changing a document to "submitted"
  // here does NOT transition the linked obligation. Obligation transitions happen ONLY on
  // the financial-aid dashboard via setObligationStatus(), which checks dependency blockers
  // FIRST (Phase 2 Step 1) and proof requirements SECOND (Phase 1 Step 3).
  //
  // This means: no dependency bypass exists through documents. A user can mark a document
  // "submitted" without affecting the obligation. The obligation remains blocked until its
  // prerequisites are verified. This is intentional — documents track paperwork status,
  // obligations track completion status. They are linked but not coupled.
  { value: "received", label: "Received" },
  { value: "verified", label: "Verified" },
  { value: "issue", label: "Issue" },
];

export default function DocumentStatusModal({ document: doc, onUpdateStatus, onClose, onDelete, onDraftEmail, drafting }: Props) {
  const [status, setStatus] = useState(doc.status);
  const [notes, setNotes] = useState(doc.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdateStatus(doc.id, status, { notes: notes || undefined });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this document?")) return;
    await onDelete(doc.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-black rounded-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-black">{doc.name}</h2>
            {doc.description && <p className="text-sm text-gray-500 mt-1">{doc.description}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {doc.deadline && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Legacy deadline (unlinked)
              </label>
              <p className="text-sm text-gray-900">
                {new Date(doc.deadline).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Canonical deadlines live in Obligations.
              </p>
            </div>
          )}

          {doc.submission_method && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Submission Method
              </label>
              <p className="text-sm text-gray-900">{doc.submission_method}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {statuses.map((s) => {
                const blocked = s.value === "received" || s.value === "verified";
                return (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    disabled={blocked}
                    title={blocked ? "Blocked: verification requires proof on the linked Obligation." : undefined}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      status === s.value
                        ? "border-black bg-black text-white"
                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                    } ${blocked ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Received/Verified are blocked: verification requires proof on the linked Obligation.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm resize-none h-20"
            />
          </div>
        </div>

        {/* Draft follow-up email */}
        {onDraftEmail && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => onDraftEmail(doc.id)}
              disabled={drafting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:border-black hover:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {drafting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {drafting ? "Drafting..." : "Draft Follow-up Email"}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleDelete}
            className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            Delete
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-black transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
