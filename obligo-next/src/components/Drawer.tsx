"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

const ANIM_MS = 220;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  const [mounted, setMounted] = useState(isOpen);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!mounted) return;

    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;

    const reduce = prefersReducedMotion();

    if (isOpen) {
      if (reduce) {
        gsap.set(backdrop, { opacity: 1 });
        gsap.set(panel, { x: 0, opacity: 1 });
        return;
      }
      gsap.set(backdrop, { opacity: 0 });
      gsap.set(panel, { x: 32, opacity: 0 });
      gsap.to(backdrop, { opacity: 1, duration: ANIM_MS / 1000, ease: "power2.out" });
      gsap.to(panel, { x: 0, opacity: 1, duration: ANIM_MS / 1000, ease: "power2.out" });
      return;
    }

    if (reduce) {
      setMounted(false);
      return;
    }

    gsap.to(backdrop, {
      opacity: 0,
      duration: ANIM_MS / 1000,
      ease: "power2.in",
    });
    gsap.to(panel, {
      x: 32,
      opacity: 0,
      duration: ANIM_MS / 1000,
      ease: "power2.in",
      onComplete: () => setMounted(false),
    });
  }, [isOpen, mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full bg-white sm:max-w-md sm:border-l sm:border-gray-200 sm:shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 border-b border-gray-100">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
