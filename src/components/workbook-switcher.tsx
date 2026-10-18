"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { WorkbookSummary } from "@/lib/data";

const SOURCE_LABEL: Record<WorkbookSummary["sourceType"], string> = {
  drive: "Google Drive",
  upload: "Uploaded file",
  local: "Local file",
};

export function WorkbookSwitcher({ workbooks }: { workbooks: WorkbookSummary[] }) {
  const wb = useSearchParams().get("wb") ?? "";
  const current = wb ? workbooks.find((w) => w.id === wb) : workbooks[0];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (workbooks.length === 0) {
    return (
      <Link href="/sheets/import" className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent">
        Import sheet
      </Link>
    );
  }

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex max-w-56 items-center gap-2 rounded-md border px-3 py-1.5 text-xs sm:max-w-72 ${
          open ? "border-accent" : "border-line hover:border-accent"
        }`}
      >
        <span className="text-muted">Workbook</span>
        <span className="truncate font-medium">{current?.name ?? "Unknown"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <ul className="max-h-80 overflow-y-auto py-1">
            {workbooks.map((w, i) => {
              const active = w.id === current?.id;
              return (
                <li key={w.id}>
                  <Link
                    href={i === 0 ? "/sheets" : `/sheets?wb=${encodeURIComponent(w.id)}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 ${active ? "font-medium" : ""}`}
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${active ? "bg-accent" : "border border-line"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{w.name}</span>
                      <span className="block text-xs font-normal text-muted">{SOURCE_LABEL[w.sourceType]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 border-t border-line p-2">
            <Link
              href="/sheets/import"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-md bg-accent px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-neutral-800"
            >
              Import sheet
            </Link>
            <Link
              href="/sheets/import#workbooks"
              onClick={() => setOpen(false)}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              Manage
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
