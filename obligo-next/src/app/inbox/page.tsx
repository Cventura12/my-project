"use client";

import { useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useEmails, AnalyzedEmail } from "@/lib/hooks/useEmails";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  Inbox,
  Mail,
  RefreshCw,
  Wifi,
  WifiOff,
  Link2,
  X,
  UploadCloud,
  FileText,
  Clipboard,
} from "lucide-react";

type TabId = "signals" | "intake";

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const {
    emails,
    connection,
    loading,
    scanning,
    scanEmails,
    dismissEmail,
  } = useEmails();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [tab, setTab] = useState<TabId>("signals");
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Intake state
  const [portalText, setPortalText] = useState("");
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);
  const intakeFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const handleScan = async () => {
    setScanResult(null);
    const result = await scanEmails();
    if (result) {
      setScanResult(
        `Scanned ${result.scanned} emails. ${result.new} new, ${result.actionable} actionable.`
      );
      setTimeout(() => setScanResult(null), 5000);
    }
  };

  const handleAttachConfirmationProof = async (email: AnalyzedEmail) => {
    if (!user) return;
    const obligationId = (prompt("Obligation ID to attach this signal as proof:", "") || "").trim();
    if (!obligationId) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/obligations/${encodeURIComponent(obligationId)}/proofs/attach-confirmation-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id, analyzed_email_id: email.id }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Attach proof failed");
      }
      alert("Proof attached. You still must verify the obligation manually.");
    } catch (e: any) {
      alert(e?.message || "Failed to attach proof");
    }
  };

  const handlePortalPaste = async () => {
    if (!user || !portalText.trim()) return;
    setIntakeLoading(true);
    setIntakeError(null);
    setIntakeSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/intake/portal-paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, raw_text: portalText }),
      });
      if (!res.ok) throw new Error("Portal paste intake failed");
      await res.json();
      setPortalText("");
      setIntakeSuccess("Portal text submitted. Check Obligations for new items.");
    } catch (e: any) {
      setIntakeError(e?.message || "Portal paste intake failed");
    } finally {
      setIntakeLoading(false);
    }
  };

  const handleOcrUpload = async (file: File) => {
    if (!user || !file) return;
    setIntakeLoading(true);
    setIntakeError(null);
    setIntakeSuccess(null);
    try {
      const source = file.type === "application/pdf" ? "pdf" : "screenshot";
      const createRes = await fetch(`${API_BASE}/api/intake/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, source }),
      });
      if (!createRes.ok) throw new Error("Failed to create intake item");
      const createData = await createRes.json();
      const intakeItemId = createData.intake_item.id;

      const path = `${user.id}/${intakeItemId}/${file.name}`;
      const supabase = createSupabaseBrowser();
      const uploadRes = await supabase.storage.from("intake").upload(path, file, { upsert: false });
      if (uploadRes.error) throw uploadRes.error;

      const uploadRow = await supabase.from("uploads").insert({
        user_id: user.id,
        bucket: "intake",
        path,
        mime_type: file.type,
        size_bytes: file.size,
      }).select("id").single();
      if (uploadRow.error) throw uploadRow.error;

      const ocrRes = await fetch(`${API_BASE}/api/intake/${intakeItemId}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          bucket: "intake",
          path,
          upload_id: uploadRow.data.id,
          source,
        }),
      });
      if (!ocrRes.ok) throw new Error("OCR intake failed");
      await ocrRes.json();
      setIntakeSuccess("Upload processed. Check Obligations for new items.");
    } catch (e: any) {
      setIntakeError(e?.message || "OCR intake failed");
    } finally {
      setIntakeLoading(false);
      if (intakeFileRef.current) intakeFileRef.current.value = "";
    }
  };

  const hasSignals = emails.length > 0;
  const actionableCount = useMemo(() => emails.filter((e) => e.requires_action).length, [emails]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F0FDF4]">
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-black">Signals Inbox</h1>
              <p className="text-xs text-gray-400">Signals only. Canonical work lives in Obligations.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {connection.connected ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <Wifi className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-gray-400">
                <WifiOff className="w-3.5 h-3.5" />
                Not connected
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setTab("signals")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              tab === "signals" ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Signals ({emails.length})
          </button>
          <button
            onClick={() => setTab("intake")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              tab === "intake" ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Intake
          </button>
        </div>

        {tab === "signals" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScan}
                  disabled={scanning || !connection.connected}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
                  {scanning ? "Scanning..." : "Scan emails"}
                </button>
                {scanResult && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                    {scanResult}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                Actionable: {actionableCount}
              </div>
            </div>

            {!connection.connected && (
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-10 text-center mb-6">
                <Mail className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Gmail not connected.</p>
                <p className="text-gray-400 text-xs mt-1">Connect Gmail in Emails to start signal scans.</p>
              </div>
            )}

            {!hasSignals && connection.connected && (
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-700 text-sm font-medium">No actionable signals yet</p>
                <p className="text-gray-400 text-xs mt-1">
                  Click “Scan emails” to check for new signals.
                </p>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
                  Scan emails
                </button>
              </div>
            )}

            {hasSignals && (
              <div className="space-y-3">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    className="bg-white border-2 border-black rounded-xl p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black truncate">
                        {email.subject || "Untitled signal"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        From: {email.sender || "Unknown sender"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        {email.category && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                            {email.category}
                          </span>
                        )}
                        {email.school_match && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {email.school_match}
                          </span>
                        )}
                        {email.deadline && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                            Deadline: {email.deadline}
                          </span>
                        )}
                        {email.relevance && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                            {email.relevance}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleAttachConfirmationProof(email)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link as proof
                      </button>
                      <button
                        onClick={() => dismissEmail(email.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "intake" && (
          <div className="space-y-6">
            <div className="bg-white border-2 border-black rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clipboard className="w-4 h-4" />
                <h2 className="text-sm font-semibold text-black">Portal Paste</h2>
              </div>
              <textarea
                value={portalText}
                onChange={(e) => setPortalText(e.target.value)}
                placeholder="Paste portal text here..."
                className="w-full h-32 rounded-lg border-2 border-gray-200 p-3 text-sm focus:outline-none focus:border-black"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handlePortalPaste}
                  disabled={intakeLoading || !portalText.trim()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  Submit
                </button>
                {intakeError && <span className="text-xs text-red-600">{intakeError}</span>}
                {intakeSuccess && <span className="text-xs text-emerald-600">{intakeSuccess}</span>}
              </div>
            </div>

            <div className="bg-white border-2 border-black rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <UploadCloud className="w-4 h-4" />
                <h2 className="text-sm font-semibold text-black">Upload OCR</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Upload a screenshot or PDF. We’ll extract deadlines and create obligations.
              </p>
              <div className="flex items-center gap-3">
                <input
                  ref={intakeFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) handleOcrUpload(file);
                  }}
                  className="text-xs"
                />
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
              {intakeError && <div className="mt-3 text-xs text-red-600">{intakeError}</div>}
              {intakeSuccess && <div className="mt-3 text-xs text-emerald-600">{intakeSuccess}</div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
