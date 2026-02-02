"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/supabase/auth-provider";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AnalyzedEmail {
  id: string;
  user_id: string;
  gmail_id: string | null;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  snippet: string | null;
  source_link: string | null;
  requires_action: boolean;
  summary: string | null;
  action_needed: string | null;
  deadline: string | null;
  deadline_implied: boolean;
  relevance: "high" | "medium" | "low" | "none";
  category: "financial_aid" | "deadline" | "document_request" | "status_update" | "general" | null;
  school_match: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailConnection {
  connected: boolean;
  provider?: string;
  email?: string;
  last_scan?: string;
}

export interface ScanResult {
  status: string;
  scanned: number;
  new: number;
  actionable: number;
  errors: number;
}

export function useEmails() {
  const { user, loading: authLoading } = useAuth();
  const [emails, setEmails] = useState<AnalyzedEmail[]>([]);
  const [connection, setConnection] = useState<EmailConnection>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Fetch emails from Supabase directly
  const fetchEmails = useCallback(async () => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("analyzed_emails")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setEmails(data as AnalyzedEmail[]);
    }
    setLoading(false);
  }, [user]);

  // Check email connection status
  const checkConnection = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/api/email/connection?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setConnection(data);
      }
    } catch (e) {
      console.error("Failed to check email connection:", e);
    }
  }, [user]);

  // Trigger a manual email scan
  const scanEmails = useCallback(async (): Promise<ScanResult | null> => {
    if (!user) return null;
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/email/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Scan failed");
      }
      const result = await res.json();
      await fetchEmails(); // Refresh the list
      return result as ScanResult;
    } catch (e) {
      console.error("Email scan error:", e);
      return null;
    } finally {
      setScanning(false);
    }
  }, [user, fetchEmails]);

  // Dismiss an email
  const dismissEmail = useCallback(async (emailId: string) => {
    if (!user) return;
    try {
      await fetch(`${API_BASE}/api/email/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, email_id: emailId }),
      });
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
    } catch (e) {
      console.error("Failed to dismiss email:", e);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setEmails([]);
      setConnection({ connected: false });
      setLoading(false);
      return;
    }
    fetchEmails();
    checkConnection();
  }, [authLoading, user, fetchEmails, checkConnection]);

  // Real-time subscription for new analyzed emails
  useEffect(() => {
    if (!user) return;

    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel("analyzed_emails_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "analyzed_emails",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newEmail = payload.new as AnalyzedEmail;
          setEmails((prev) => [newEmail, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Computed stats
  const actionableCount = emails.filter((e) => e.requires_action).length;
  const highRelevanceCount = emails.filter((e) => e.relevance === "high").length;

  return {
    emails,
    connection,
    loading,
    scanning,
    actionableCount,
    highRelevanceCount,
    scanEmails,
    dismissEmail,
    checkConnection,
    refetch: fetchEmails,
  };
}
