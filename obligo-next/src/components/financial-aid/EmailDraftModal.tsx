"use client";

import { useState, useEffect } from "react";
import { FollowUp } from "@/lib/hooks/useFollowUps";
import { X, Send, Sparkles, Ban } from "lucide-react";

interface EmailDraftModalProps {
  draft: FollowUp;
  onClose: () => void;
  onSend: (followUpId: string, editedContent: string, editedSubject: string) => Promise<boolean>;
  onImprove: (followUpId: string, feedback: string) => Promise<string | null>;
  onCancel: (followUpId: string) => Promise<boolean>;
}

export default function EmailDraftModal({
  draft,
  onClose,
  onSend,
  onImprove,
  onCancel,
}: EmailDraftModalProps) {
  const [subject, setSubject] = useState(draft.subject || "");
  const [body, setBody] = useState(draft.edited_content || draft.drafted_content);
  const [recipient, setRecipient] = useState(draft.recipient_email || "");
  const [feedback, setFeedback] = useState("");
  const [improving, setImproving] = useState(false);
  const [sending, setSending] = useState(false);

  // Sync if draft changes externally (e.g. from improve)
  useEffect(() => {
    if (draft.edited_content) setBody(draft.edited_content);
  }, [draft.edited_content]);

  const handleImprove = async () => {
    if (!feedback.trim()) return;
    setImproving(true);
    const improved = await onImprove(draft.id, feedback.trim());
    if (improved) {
      setBody(improved);
      setFeedback("");
    }
    setImproving(false);
  };

  const handleSend = async () => {
    setSending(true);
    const success = await onSend(draft.id, body, subject);
    setSending(false);
    if (success) onClose();
  };

  const handleCancel = async () => {
    await onCancel(draft.id);
    onClose();
  };

  const schoolName = draft.metadata?.school_name || "School";
  const documentName = draft.metadata?.document_name;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-black rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-black">Review Email Draft</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {schoolName}
              {documentName && ` · ${documentName}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-black transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Recipient */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              To
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="financialaid@school.edu"
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm resize-none h-48"
            />
          </div>

          {/* AI Improve */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Ask AI to improve
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImprove()}
                placeholder="e.g. 'Make it more formal' or 'Add urgency'"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
              />
              <button
                onClick={handleImprove}
                disabled={improving || !feedback.trim()}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {improving ? "..." : "Improve"}
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Discard
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-black transition-colors"
            >
              Save for later
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !recipient.trim()}
              className="px-5 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? "Sending..." : "Approve & Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
