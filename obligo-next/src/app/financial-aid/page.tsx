"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useSchools } from "@/lib/hooks/useSchools";
import { useDocuments, Document } from "@/lib/hooks/useDocuments";
import { useFollowUps } from "@/lib/hooks/useFollowUps";
import SchoolCard from "@/components/financial-aid/SchoolCard";
import { Plus, LogOut, FileText, AlertTriangle, CheckCircle2, Clock, Mail, FileEdit } from "lucide-react";

export default function FinancialAidDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { schools, loading: schoolsLoading } = useSchools();
  const { documents, loading: docsLoading } = useDocuments();
  const { pendingDrafts } = useFollowUps();
  const router = useRouter();

  const loading = authLoading || schoolsLoading || docsLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Stats
  const totalDocs = documents.length;
  const submitted = documents.filter((d) => ["submitted", "received", "verified"].includes(d.status)).length;
  const pending = documents.filter((d) => ["not_started", "in_progress"].includes(d.status)).length;
  const overdue = documents.filter((d) => {
    if (!d.deadline || ["received", "verified"].includes(d.status)) return false;
    return new Date(d.deadline) < new Date();
  }).length;

  // Group documents by school
  const docsBySchool = documents.reduce<Record<string, Document[]>>((acc, doc) => {
    if (!acc[doc.school_id]) acc[doc.school_id] = [];
    acc[doc.school_id].push(doc);
    return acc;
  }, {});

  if (loading) {
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
            <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white font-bold">O</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-black">Financial Aid Tracker</h1>
              <p className="text-xs text-gray-400">
                {user?.email?.split("@")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/emails")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors"
            >
              <Mail className="w-4 h-4" />
              Emails
            </button>
            <button
              onClick={() => router.push("/financial-aid/approvals")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors relative"
            >
              <FileEdit className="w-4 h-4" />
              Approvals
              {pendingDrafts.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {pendingDrafts.length}
                </span>
              )}
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="text-sm text-gray-400 hover:text-black transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        {totalDocs > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <FileText className="w-5 h-5 text-gray-400 mx-auto" />
              <p className="text-2xl font-bold text-black mt-1">{totalDocs}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Total</p>
            </div>
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
              <p className="text-2xl font-bold text-emerald-600 mt-1">{submitted}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Submitted</p>
            </div>
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <Clock className="w-5 h-5 text-yellow-500 mx-auto" />
              <p className="text-2xl font-bold text-yellow-600 mt-1">{pending}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Pending</p>
            </div>
            <div className="bg-white border-2 border-black rounded-xl p-4 text-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto" />
              <p className="text-2xl font-bold text-red-600 mt-1">{overdue}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">Overdue</p>
            </div>
          </div>
        )}

        {/* Urgent banner */}
        {overdue > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {overdue} document{overdue > 1 ? "s" : ""} past deadline. Review immediately.
            </p>
          </div>
        )}

        {/* Schools */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Your Schools</h2>
          <button
            onClick={() => router.push("/onboarding")}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add school
          </button>
        </div>

        {schools.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No schools added yet.</p>
            <button
              onClick={() => router.push("/onboarding")}
              className="mt-4 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add your schools
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <SchoolCard key={school.id} school={school} documents={docsBySchool[school.id] || []} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
