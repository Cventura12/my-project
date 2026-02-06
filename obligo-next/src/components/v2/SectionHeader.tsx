"use client";

export default function SectionHeader({
  title,
  count,
  right,
}: {
  title: string;
  count?: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {typeof count === "number" && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      {right}
    </div>
  );
}
