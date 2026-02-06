"use client";

import ApprovalRow from "./ApprovalRow";

export default function ApprovalsQueue({
  drafts,
  onOpen,
}: {
  drafts: any[];
  onOpen: (draft: any) => void;
}) {
  return (
    <div className="space-y-3">
      {drafts.map((draft) => (
        <ApprovalRow key={draft.id} draft={draft} onOpen={() => onOpen(draft)} />
      ))}
    </div>
  );
}
