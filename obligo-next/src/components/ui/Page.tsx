"use client";

import { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl sm:text-3xl font-extrabold text-black">{children}</h1>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
      {children}
    </h2>
  );
}

export function MetaText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center">
      {children}
    </div>
  );
}

export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <p className="text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:text-red-800 hover:border-red-300"
      >
        Retry
      </button>
    </div>
  );
}
