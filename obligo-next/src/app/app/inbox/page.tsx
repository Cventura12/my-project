"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, SectionHeader, Skeleton } from "@/components/ui/Page";
import { NAV_LABELS, EMPTY_STATES } from "@/lib/copy";
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
        <SectionHeader
          title={NAV_LABELS.inbox}
          subtitle="Signals that may require an obligation, proof, or follow-up."
        />
        <div className="flex items-center gap-2">
          <Badge variant={connection.connected ? "success" : "neutral"}>
            <span className="inline-flex items-center gap-1">
              {connection.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connection.connected ? "Connected" : "Not connected"}
            </span>
          </Badge>
          <Button
            onClick={handleScan}
            disabled={!connection.connected || scanning}
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              Scan email
            </span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search signals"
          className="px-3 py-2 text-sm border border-border/60 rounded-lg focus:outline-none focus:border-border"
        />
        <label className="text-xs text-muted-foreground inline-flex items-center gap-2">
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
          <Mail className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Not connected to Gmail.</p>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = `${API_BASE}/oauth/gmail?user_id=${encodeURIComponent(user.id)}`;
              }}
            >
              Connect Gmail
            </Button>
          </div>
        </EmptyState>
      ) : signals.length === 0 ? (
        <EmptyState>
          <Inbox className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground whitespace-pre-line">{EMPTY_STATES.inbox}</p>
          <div className="mt-3">
            <Button onClick={handleScan} variant="primary">
              Scan email
            </Button>
          </div>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <p className="text-sm text-muted-foreground">No matches.</p>
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
