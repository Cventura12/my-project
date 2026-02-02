"use client";

import { useState } from "react";
import { CreateDocumentInput } from "@/lib/hooks/useDocuments";
import { Plus } from "lucide-react";

interface Props {
  schoolId: string;
  onAdd: (input: CreateDocumentInput) => Promise<any>;
}

export default function AddDocumentForm({ schoolId, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("form");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({
      school_id: schoolId,
      name: name.trim(),
      type,
      deadline: deadline || undefined,
      description: description || undefined,
    });
    setName("");
    setType("form");
    setDeadline("");
    setDescription("");
    setSaving(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-black transition-colors mt-3"
      >
        <Plus className="w-4 h-4" />
        Add document
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 border-2 border-dashed border-gray-200 rounded-lg space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Document name (e.g. FAFSA)"
        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm text-gray-600"
        >
          <option value="form">Form</option>
          <option value="tax">Tax Document</option>
          <option value="transcript">Transcript</option>
          <option value="letter">Letter</option>
          <option value="id">ID Document</option>
          <option value="financial">Financial</option>
          <option value="other">Other</option>
        </select>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm text-gray-600"
        />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-black transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
