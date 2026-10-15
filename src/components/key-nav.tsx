"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** ← / → move between records, Esc goes back to the list. Ignored while typing. */
export function KeyNav({ prev, next, back }: { prev?: string; next?: string; back: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[data-lightbox]")) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      else if (e.key === "ArrowRight" && next) router.push(next);
      else if (e.key === "Escape") router.push(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, back, router]);
  return null;
}
