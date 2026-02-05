"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Fuse from "fuse.js";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";

import { useAuth } from "@/lib/supabase/auth-provider";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SCHOOL_OPTIONS } from "@/lib/data/schools";

type StepId = 1 | 2 | 3 | 4;

type AppType = "undergraduate" | "transfer" | "graduate";

type SchoolDraft = {
  tempId: string;
  name: string;
  application_type: AppType;
  application_deadline: string; // YYYY-MM-DD or ""
  financial_aid_deadline: string; // YYYY-MM-DD or ""
};

type DocTemplate = {
  name: string;
  type: "form";
  description: string;
};

const DOC_TEMPLATES: DocTemplate[] = [
  {
    name: "FAFSA",
    type: "form",
    description: "Submit your FAFSA to ensure eligibility for federal aid.",
  },
  {
    name: "CSS Profile",
    type: "form",
    description: "Some schools require CSS Profile for institutional aid.",
  },
];

function uid() {
  // Good enough for temp IDs in the browser.
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function isYear(value: string) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2040;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<StepId>(1);

  // Step 1: profile
  const [fullName, setFullName] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2: schools
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schools, setSchools] = useState<SchoolDraft[]>([]);
  const [skipSchools, setSkipSchools] = useState(false);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);

  // UX state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const progressPct = useMemo(() => Math.round((step / 4) * 100), [step]);

  const fuse = useMemo(() => {
    return new Fuse(SCHOOL_OPTIONS, {
      keys: ["name", "aliases"],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, []);

  const filteredSchoolOptions = useMemo(() => {
    const q = schoolQuery.trim();
    const already = new Set(schools.map((s) => s.name.toLowerCase()));

    // When the user hasn't started typing, show "popular" options from the dataset.
    if (!q || q.length < 2) {
      return SCHOOL_OPTIONS.map((o) => o.name)
        .filter((name) => !already.has(name.toLowerCase()))
        .slice(0, 8);
    }

    return fuse
      .search(q)
      .map((r) => r.item.name)
      .filter((name) => !already.has(name.toLowerCase()))
      .slice(0, 8);
  }, [schoolQuery, schools, fuse]);

  const canGoNext = useMemo(() => {
    if (step === 1) {
      if (!fullName.trim()) return false;
      if (!isYear(graduationYear)) return false;
      return true;
    }
    if (step === 2) {
      return schools.length > 0 || skipSchools;
    }
    if (step === 3) {
      // If the user chose "skip for now", Step 3 becomes informational.
      return true;
    }
    return true;
  }, [step, fullName, graduationYear, schools.length, skipSchools]);

  const addSchool = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (schools.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;

    setSchools((prev) => [
      ...prev,
      {
        tempId: uid(),
        name: trimmed,
        application_type: "undergraduate",
        application_deadline: "",
        financial_aid_deadline: "",
      },
    ]);
    setSkipSchools(false);
    setSchoolQuery("");
  };

  const removeSchool = (tempId: string) => {
    setSchools((prev) => prev.filter((s) => s.tempId !== tempId));
  };

  const updateSchool = (tempId: string, patch: Partial<SchoolDraft>) => {
    setSchools((prev) => prev.map((s) => (s.tempId === tempId ? { ...s, ...patch } : s)));
  };

  const goNext = () => {
    if (!canGoNext) return;
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as StepId) : s));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s));
  };

  const handleFinish = async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowser();

      // 1) Update profile
      {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim(),
            graduation_year: isYear(graduationYear) ? Number(graduationYear) : null,
            phone: phone.trim() || null,
            onboarding_completed: true,
          })
          .eq("id", user.id);

        if (profileError) throw profileError;
      }

      // 2) Insert schools (batch)
      if (schools.length > 0) {
        const schoolsToInsert = schools.map((s) => ({
          user_id: user.id,
          name: s.name,
          application_type: s.application_type,
          // Phase 1 doctrine: deadlines are canonical only in `obligations`.
          application_deadline: null,
          financial_aid_deadline: null,
          status: "applying",
        }));

        const { data: insertedSchools, error: schoolsError } = await supabase
          .from("schools")
          .insert(schoolsToInsert)
          .select("id,name");

        if (schoolsError) throw schoolsError;
        if (!insertedSchools || insertedSchools.length === 0) {
          throw new Error("No schools were created.");
        }

        // Keep local user-entered deadlines only long enough to mint canonical obligations.
        const draftByName = new Map(schools.map((s) => [s.name, s]));
        const aidDeadlineBySchoolId: Record<string, string | null> = {};
        for (const school of insertedSchools) {
          const draft = draftByName.get(school.name);
          const raw = draft?.financial_aid_deadline?.trim() || "";
          aidDeadlineBySchoolId[school.id] = raw ? raw : null;
        }

        // 3) Auto-generate docs per school (batch)
        const docsToInsert = insertedSchools.flatMap((school) =>
          DOC_TEMPLATES.map((tpl) => ({
            user_id: user.id,
            school_id: school.id,
            name: tpl.name,
            type: tpl.type,
            description: tpl.description,
            // Phase 1 doctrine: do not store canonical deadlines on `documents`.
            deadline: null,
            status: "not_started",
          }))
        );

        const { data: insertedDocs, error: docsError } = await supabase
          .from("documents")
          .insert(docsToInsert)
          .select("id,school_id,name");
        if (docsError) throw docsError;

        // 4) Mint canonical obligations for the generated docs.
        if (insertedDocs && insertedDocs.length > 0) {
          const obligationsToInsert = insertedDocs.map((doc) => {
            const title = doc.name.toLowerCase().startsWith("submit ")
              ? doc.name
              : `Submit ${doc.name}`;
            const type = title.toLowerCase().includes("fafsa")
              ? "FAFSA"
              : "APPLICATION_SUBMISSION";
            return {
              user_id: user.id,
              type,
              title,
              source: "manual",
              source_ref: `document:${doc.id}`,
              deadline: aidDeadlineBySchoolId[doc.school_id] || null,
              status: "pending",
              proof_required: type === "FAFSA",
            };
          });

          const { error: obligationsError } = await supabase
            .from("obligations")
            .insert(obligationsToInsert);
          if (obligationsError) throw obligationsError;
        }
      }

      router.push("/dashboard");
    } catch (e: any) {
      console.error("Onboarding finish error:", e);
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F0FDF4] px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="bg-white border-2 border-black rounded-2xl p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
                Onboarding
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-black">
                Let&apos;s get you set up
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                This takes about 2 minutes. You can edit everything later.
              </p>
            </div>
            <div className="shrink-0 text-xs text-gray-400">
              Step <span className="font-semibold text-gray-700">{step}</span> of{" "}
              <span className="font-semibold text-gray-700">4</span>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-6">
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Body */}
          <div className="mt-8">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step-1"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Profile setup
                  </h2>

                  <div className="mt-4 grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full name
                      </label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Caleb Johnson"
                        className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 transition-colors"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          High school grad year
                        </label>
                        <input
                          inputMode="numeric"
                          value={graduationYear}
                          onChange={(e) => setGraduationYear(e.target.value)}
                          placeholder="e.g. 2026"
                          className={classNames(
                            "w-full rounded-xl border-2 px-3 py-2.5 text-sm focus:outline-none transition-colors",
                            graduationYear && !isYear(graduationYear)
                              ? "border-red-200 focus:border-red-400"
                              : "border-gray-200 focus:border-emerald-600"
                          )}
                        />
                        <p className="mt-1 text-xs text-gray-400">
                          Used for better deadline defaults and scholarships later.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phone (optional)
                        </label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. (555) 123-4567"
                          className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 transition-colors"
                        />
                        <p className="mt-1 text-xs text-gray-400">
                          Optional. We can use this for SMS reminders later.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Add schools
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Start typing to search. Pick the schools you&apos;re applying to (you can skip and add later).
                  </p>

                  <div className="mt-5">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search schools
                    </label>

                    <div className="relative">
                      <input
                        value={schoolQuery}
                        onChange={(e) => setSchoolQuery(e.target.value)}
                        onFocus={() => setSchoolPickerOpen(true)}
                        onBlur={() => {
                          // Allow click selection inside the dropdown before closing.
                          setTimeout(() => setSchoolPickerOpen(false), 120);
                        }}
                        placeholder="Type: New York University"
                        className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => addSchool(schoolQuery)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-colors"
                        title="Add school"
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>

                      {schoolPickerOpen && (schoolQuery.trim().length > 0 || filteredSchoolOptions.length > 0) && (
                        <div className="absolute z-10 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                          <div className="px-4 pt-3 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            {schoolQuery.trim().length < 2 ? "Popular schools" : "Search results"}
                          </div>
                          {filteredSchoolOptions.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              No matches. You can still add &quot;{schoolQuery.trim()}&quot;.
                            </div>
                          ) : (
                            <div className="max-h-56 overflow-auto">
                              {filteredSchoolOptions.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => addSchool(opt)}
                                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors flex items-center justify-between"
                                >
                                  <span className="text-gray-900">{opt}</span>
                                  <span className="text-emerald-700 text-xs font-medium">Add</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected schools */}
                  <div className="mt-6">
                    {schools.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-6">
                        <p className="text-sm font-medium text-gray-700">
                          No schools selected yet
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Add at least one school to continue. We&apos;ll generate a starter
                          document checklist automatically.
                        </p>
                        <div className="mt-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSkipSchools(true);
                              setError(null);
                              setStep(3);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Skip for now
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <p className="text-xs text-gray-400">
                            You&apos;ll land on your dashboard and can add schools anytime.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {schools.map((s) => (
                          <div
                            key={s.tempId}
                            className="rounded-2xl border-2 border-black bg-white p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-black truncate">
                                  {s.name}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  Add deadlines now, or skip and fill them in later.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSchool(s.tempId)}
                                className="w-9 h-9 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center shrink-0"
                                title="Remove"
                              >
                                <X className="w-4 h-4 text-gray-500" />
                              </button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                  Application type
                                </label>
                                <select
                                  value={s.application_type}
                                  onChange={(e) =>
                                    updateSchool(s.tempId, { application_type: e.target.value as AppType })
                                  }
                                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-emerald-600 transition-colors"
                                >
                                  <option value="undergraduate">Undergraduate</option>
                                  <option value="transfer">Transfer</option>
                                  <option value="graduate">Graduate</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                  App deadline
                                </label>
                                <input
                                  type="date"
                                  value={s.application_deadline}
                                  onChange={(e) => updateSchool(s.tempId, { application_deadline: e.target.value })}
                                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-emerald-600 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                  Aid deadline
                                </label>
                                <input
                                  type="date"
                                  value={s.financial_aid_deadline}
                                  onChange={(e) => updateSchool(s.tempId, { financial_aid_deadline: e.target.value })}
                                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-emerald-600 transition-colors"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step-3"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Starter document checklist
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    We&apos;ll create these requirements for each school. You can add more later.
                  </p>

                  {schools.length === 0 ? (
                    <div className="mt-6 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-6">
                      <p className="text-sm font-medium text-gray-700">No schools yet — that&apos;s okay</p>
                      <p className="mt-1 text-sm text-gray-500">
                        You chose to skip school selection. We won&apos;t generate documents right now.
                        You can add schools later from your dashboard and we&apos;ll build the checklist then.
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Add schools now
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep(4)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                        >
                          Continue
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {schools.map((s) => (
                        <div key={s.tempId} className="rounded-2xl border-2 border-black p-4 bg-white">
                          <p className="text-sm font-semibold text-black">{s.name}</p>
                          <div className="mt-3 space-y-2">
                            {DOC_TEMPLATES.map((doc) => (
                              <div
                                key={`${s.tempId}:${doc.name}`}
                                className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
                              >
                                <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                                  <Check className="w-4 h-4 text-emerald-700" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="step-4"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Finalize
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    We&apos;ll save your profile, add schools, and generate your first checklist.
                  </p>

                  <div className="mt-6 rounded-2xl border-2 border-black bg-white p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Profile
                        </p>
                        <p className="mt-1 text-gray-900 font-medium">{fullName || "—"}</p>
                        <p className="mt-1 text-gray-500">Grad year: {graduationYear || "—"}</p>
                        <p className="mt-1 text-gray-500">Phone: {phone.trim() ? phone : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Schools
                        </p>
                        <p className="mt-1 text-gray-900 font-medium">
                          {schools.length} selected
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {schools.slice(0, 6).map((s) => (
                            <span
                              key={s.tempId}
                              className="px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-800 border border-emerald-100"
                            >
                              {s.name}
                            </span>
                          ))}
                          {schools.length > 6 && (
                            <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">
                              +{schools.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Tip: After onboarding, connect Gmail in <span className="font-semibold">Emails</span> to auto-detect financial aid updates.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || submitting}
              className={classNames(
                "inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-colors",
                step === 1 || submitting
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-black text-black hover:bg-gray-50"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext || submitting}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors",
                  !canGoNext || submitting
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                )}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting || !canGoNext}
                className={classNames(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors min-w-[140px]",
                  submitting || !canGoNext
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Finish"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
