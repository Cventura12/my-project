"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{children}</h1>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

export function SectionHeader({
  title,
  subtitle,
  size = "page",
  count,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: "page" | "section";
  count?: number;
  right?: ReactNode;
}) {
  if (size === "section") {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionTitle>{title}</SectionTitle>
          {typeof count === "number" && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </div>
        {right}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <PageTitle>{title}</PageTitle>
      {subtitle ? <MetaText>{subtitle}</MetaText> : null}
    </div>
  );
}

export function MetaText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background border border-border/60 rounded-lg p-5">
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background border border-dashed border-border/60 rounded-lg p-6 text-center">
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode;
  variant?:
    | "neutral"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "critical"
    | "high"
    | "normal"
    | "blocked"
    | "proof";
  className?: string;
}) {
  const styles: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground border-border/60",
    success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
    info: "bg-muted text-muted-foreground border-border/60",
    critical: "bg-destructive/10 text-destructive border-destructive/20",
    high: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    normal: "bg-muted text-muted-foreground border-border/60",
    blocked: "bg-muted text-muted-foreground border-border/60",
    proof: "bg-amber-500/10 text-amber-800 border-amber-500/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };
  const variants = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "border border-border/60 bg-background text-foreground hover:bg-muted/40",
    ghost: "text-foreground hover:bg-muted/40",
    destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  };

  const { type = "button", ...rest } = props;

  return (
    <button
      type={type}
      {...rest}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`bg-muted/40 rounded animate-pulse ${className}`} />;
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-background border border-destructive/30 rounded-lg p-4">
      <p className="text-sm text-destructive">{message}</p>
      <Button onClick={onRetry} variant="destructive" size="sm" className="mt-3">
        Retry
      </Button>
    </div>
  );
}
