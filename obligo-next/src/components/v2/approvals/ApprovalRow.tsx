"use client";

export default function ApprovalRow({
  draft,
  onOpen,
}: {
  draft: any;
  onOpen: () => void;
}) {
  const schoolName = draft?.metadata?.school_name || "Unknown school";
  const obligationTitle = draft?.metadata?.obligation_title || draft?.subject || "Follow-up";
  const why =
    draft?.draft_type ||
    draft?.inquiry_type ||
    draft?.follow_up_type ||
    "Follow-up draft";

  const ts = draft?.updated_at || draft?.created_at;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black truncate">{obligationTitle}</p>
          <p className="text-xs text-gray-400 mt-1">{schoolName}</p>
        </div>
        <div className="text-xs text-gray-500">
          {ts ? new Date(ts).toLocaleDateString() : "—"}
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500">{why}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
          {draft?.status || "draft"}
        </span>
        <span className="px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200 max-w-[160px] truncate">
          {draft?.subject || "No subject"}
        </span>
      </div>
    </button>
  );
}
