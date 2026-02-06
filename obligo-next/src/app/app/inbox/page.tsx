"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, MetaText, PageTitle, Skeleton } from "@/components/ui/Page";
import { NAV_LABELS, EMPTY_STATES, BUTTON_LABELS } from "@/lib/copy";
import SignalsList from "@/components/v2/inbox/SignalsList";
import SignalDrawer from "@/components/v2/inbox/SignalDrawer";
import { getEmailConnection, listSignals, scanEmail, dismissEmail } from "@/api/inbox";
import { apiPost } from "@/api/client";
import { toUISignalFromEmail } from "@/adapters/signalAdapter";
import { UISignal } from "@/types/ui";
import { useAuth } from "@/lib/supabase/auth-provider";
import { Inbox, RefreshCw, Wifi, WifiOff, Mail } from "lucide-react";

type Connection = { connected: boolean; provider?: string; email?: string; last_scan?: string };

export default function InboxV2Page() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<UISignal[]>([]);
  const [rawSignals, setRawSignals] = useState<any[]>([]);
  const [connection, setConnection] = useState<Connection>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionableOnly, setActionableOnly] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<UISignal | null>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const load = async (currentUserId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [conn, list] = await Promise.all([
        getEmailConnection(currentUserId),
        listSignals(currentUserId),
      ]);
      setConnection(conn);
      setRawSignals(list.emails || []);
      setSignals((list.emails || []).map(toUISignalFromEmail));
    } catch (e: any) {
      setSignals([]);
      setRawSignals([]);
      setError(e?.message || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      if (!alive) return;
      await load(user.id);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (actionableOnly && !s.requiresAction) return false;
      if (!q) return true;
      return (
        s.subject.toLowerCase().includes(q) ||
        s.from.toLowerCase().includes(q) ||
        s.school.toLowerCase().includes(q)
      );
    });
  }, [signals, query, actionableOnly]);

  const handleScan = async () => {
    if (!user) return;
    setScanning(true);
    try {
      await scanEmail(user.id);
      const list = await listSignals(user.id);
      setRawSignals(list.emails || []);
      setSignals((list.emails || []).map(toUISignalFromEmail));
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (signalId: string) => {
    if (!user) return;
    await dismissEmail(user.id, signalId);
    setSignals((prev) => prev.filter((s) => s.id !== signalId));
  };

  const handleAttachProof = async (signalId: string, obligationId: string) => {
    if (!user) return;
    await apiPost(
      `/api/obligations/${encodeURIComponent(obligationId)}/proofs/attach-confirmation-email`,
      { user_id: user.id, analyzed_email_id: signalId }
    );
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <PageTitle>{NAV_LABELS.inbox}</PageTitle>
          <MetaText>Signals that may require an obligation, proof, or follow-up.</MetaText>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs border ${
              connection.connected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            {connection.connected ? (
              <span className="inline-flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                Not connected
              </span>
            )}
          </span>
          <button
            onClick={handleScan}
            disabled={!connection.connected || scanning}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              Scan email
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search signals"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-black"
        />
        <label className="text-xs text-gray-600 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={actionableOnly}
            onChange={(e) => setActionableOnly(e.target.checked)}
          />
          Actionable only
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(user.id)} />
      ) : !connection.connected ? (
        <EmptyState>
          <Mail className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Not connected to Gmail.</p>
          <a
            href={`${API_BASE}/oauth/gmail?user_id=${encodeURIComponent(user.id)}`}
            className="inline-block mt-3 px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white hover:bg-gray-800"
          >
            Connect Gmail
          </a>
        </EmptyState>
      ) : signals.length === 0 ? (
        <EmptyState>
          <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 whitespace-pre-line">{EMPTY_STATES.inbox}</p>
          <button
            onClick={handleScan}
            className="inline-block mt-3 px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white hover:bg-gray-800"
          >
            Scan email
          </button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <p className="text-sm text-gray-500">No matches.</p>
        </EmptyState>
      ) : (
        <SignalsList
          items={filtered}
          rawItems={rawSignals}
          onDismiss={handleDismiss}
          onOpen={(signal) => setSelectedSignal(signal)}
        />
      )}

      <SignalDrawer
        signal={selectedSignal}
        rawSignal={rawSignals.find((r) => r.id === selectedSignal?.id)}
        onClose={() => setSelectedSignal(null)}
        onDismiss={(id) => handleDismiss(id)}
        onAttachProof={(signalId, obligationId) => handleAttachProof(signalId, obligationId)}
      />
    </div>
  );
}
