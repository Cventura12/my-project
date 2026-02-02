"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-provider";
import { useSchools, CreateSchoolInput } from "@/lib/hooks/useSchools";
import { Plus, X, ArrowRight, GraduationCap } from "lucide-react";

interface SchoolEntry {
  name: string;
  application_type: string;
  financial_aid_deadline: string;
}

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const [schools, setSchools] = useState<SchoolEntry[]>([
    { name: "", application_type: "undergraduate", financial_aid_deadline: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const { addSchool } = useSchools();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  const updateSchool = (index: number, field: keyof SchoolEntry, value: string) => {
    setSchools((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addRow = () => {
    setSchools((prev) => [...prev, { name: "", application_type: "undergraduate", financial_aid_deadline: "" }]);
  };

  const removeRow = (index: number) => {
    if (schools.length === 1) return;
    setSchools((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const validSchools = schools.filter((s) => s.name.trim());
    if (validSchools.length === 0) return;

    setSaving(true);
    for (const school of validSchools) {
      await addSchool({
        name: school.name.trim(),
        application_type: school.application_type,
        financial_aid_deadline: school.financial_aid_deadline || undefined,
      });
    }
    router.push("/financial-aid");
  };

  const hasValidSchool = schools.some((s) => s.name.trim());

  return (
    <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="bg-white border-2 border-black rounded-xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-black">Let&apos;s track your financial aid</h1>
              <p className="text-sm text-gray-500">What schools are you applying to?</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {schools.map((school, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={school.name}
                    onChange={(e) => updateSchool(index, "name", e.target.value)}
                    placeholder="School name (e.g. NYU)"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
                  />
                  <div className="flex gap-2">
                    <select
                      value={school.application_type}
                      onChange={(e) => updateSchool(index, "application_type", e.target.value)}
                      className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm text-gray-600"
                    >
                      <option value="undergraduate">Undergraduate</option>
                      <option value="graduate">Graduate</option>
                      <option value="transfer">Transfer</option>
                    </select>
                    <input
                      type="date"
                      value={school.financial_aid_deadline}
                      onChange={(e) => updateSchool(index, "financial_aid_deadline", e.target.value)}
                      className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm text-gray-600"
                      placeholder="Aid deadline"
                    />
                  </div>
                </div>
                {schools.length > 1 && (
                  <button
                    onClick={() => removeRow(index)}
                    className="mt-2 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add another school
          </button>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!hasValidSchool || saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
