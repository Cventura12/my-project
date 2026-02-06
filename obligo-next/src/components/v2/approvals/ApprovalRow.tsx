"use client";

import { Badge, Button } from "@/components/ui/Page";

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
    <Button
      onClick={onOpen}
      variant="ghost"
      className="w-full text-left justify-start border border-border/60 rounded-lg p-4 hover:bg-muted/40"
    >
      <div className="w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{obligationTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">{schoolName}</p>
          </div>
          <div className="text-xs text-muted-foreground">
            {ts ? new Date(ts).toLocaleDateString() : "-"}
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">{why}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          <Badge variant="neutral">{draft?.status || "draft"}</Badge>
          <Badge variant="neutral" className="max-w-[160px] truncate">
            {draft?.subject || "No subject"}
          </Badge>
        </div>
      </div>
    </Button>
  );
}
