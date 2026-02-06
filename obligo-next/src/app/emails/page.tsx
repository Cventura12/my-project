"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useEmails, AnalyzedEmail } from "@/lib/hooks/useEmails";
import EmailCard from "@/components/financial-aid/EmailCard";
import CriticalOblBar from "@/components/financial-aid/CriticalOblBar";
import LegacyBanner from "@/components/financial-aid/LegacyBanner";
import {
  ArrowLeft,
  Mail,
  RefreshCw,
  Filter,
  AlertTriangle,
  Inbox,
  Wifi,
  WifiOff,
} from "lucide-react";

type FilterMode = "all" | "actionable" | "high";

export default function EmailsPage() {
  const { user, loading: authLoading } = useAuth();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const {
    emails,
    connection,
    loading,
    scanning,
    actionableCount,
    highRelevanceCount,
    scanEmails,
    dismissEmail,
  } = useEmails();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const connectUrl = user
    ? `${API_BASE}/oauth/gmail?user_id=${encodeURIComponent(user.id)}`
    : `${API_BASE}/oauth/gmail`;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const handleScan = async () => {
    setScanResult(null);
    const result = await scanEmails();
    if (result) {
      setScanResult(`Scanned ${result.scanned} emails. ${result.new} new, ${result.actionable} actionable.`);
      setTimeout(() => setScanResult(null), 5000);
    }
  };

  const handleAttachConfirmationProof = async (email: AnalyzedEmail) => {
    if (!user) return;

    const obligationId = (prompt("Obligation ID to attach this email as proof:", "") || "").trim();
    if (!obligationId) return;

    if (!confirm("Attach this email as confirmation proof? This will NOT auto-verify.")) return;

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

  const filtered: AnalyzedEmail[] = emails.filter((e) => {
    if (filter === "actionable") return e.requires_action;
    if (filter === "high") return e.relevance === "high";
    return true;
  });

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
      {/* Header */}
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/financial-aid")}
              className="w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-black">Email Monitor</h1>
              <p className="text-xs text-gray-400">
                Signals only - canonical deadlines live in Obligations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection.connected ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Wifi className="w-3.5 h-3.5" />
                Gmail connected
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <WifiOff className="w-3.5 h-3.5" />
                Not connected
              </div>
            )}
          </div>
        </div>
      </header>

      <LegacyBanner />

      {/* Phase 3 Step 2: Cross-context visibility.
          Critical/failed obligations are visible on EVERY main screen. */}
      <CriticalOblBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Scan controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={scanning || !connection.connected}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Scan emails"}
            </button>
            {connection.last_scan && (
              <span className="text-xs text-gray-400">
                Last: {new Date(connection.last_scan).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Scan result toast */}
        {scanResult && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 mb-6 text-sm text-emerald-700">
            {scanResult}
          </div>
        )}

        {/* Not connected state */}
        {!connection.connected && (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center mb-6">
            <Mail className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Gmail not connected.</p>
            <p className="text-gray-400 text-xs mt-1">
              Connect your Gmail account through the backend OAuth flow:
              <code className="bg-gray-100 px-1 rounded ml-1">{connectUrl}</code>
            </p>
            <a
              href={connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-5 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Connect Gmail
            </a>
          </div>
        )}

        {/* Filter tabs */}
        {emails.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-400" />
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filter === "all"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              All ({emails.length})
            </button>
            <button
              onClick={() => setFilter("actionable")}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filter === "actionable"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Action needed ({actionableCount})
            </button>
            <button
              onClick={() => setFilter("high")}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filter === "high"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              High priority ({highRelevanceCount})
            </button>
          </div>
        )}

        {/* Email list */}
        {filtered.length === 0 && connection.connected ? (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {emails.length === 0
                ? "No emails analyzed yet. Click \"Scan emails\" to start."
                : "No emails match this filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                onDismiss={dismissEmail}
                onAttachConfirmationProof={handleAttachConfirmationProof}
              />
            ))}
          </div>
        )}

        {/* Actionable summary banner */}
        {actionableCount > 0 && filter === "all" && (
          <div className="mt-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {actionableCount} email{actionableCount > 1 ? "s" : ""} need your attention.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
