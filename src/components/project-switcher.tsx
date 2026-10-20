"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chevron } from "./bug-field-select";

export interface SwitcherProject {
  key: string;
  name: string;
  openBugs: number;
}

/** The project's name and key; opens a list of the organization's other projects to jump to. */
export function ProjectSwitcher({ org, current, projects }: { org: string; current: SwitcherProject; projects: SwitcherProject[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-surface-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent font-mono text-[11px] font-semibold text-white">
          {current.key.slice(0, 3)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="block font-mono text-[11px] text-muted">{current.key}</span>
        </span>
        <Chevron className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Projects</p>
          {projects.map((p) => (
            <Link
              key={p.key}
              role="menuitem"
              href={`/o/${org}/p/${p.key}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2 ${p.key === current.key ? "font-medium" : ""}`}
            >
              <span className="w-10 shrink-0 font-mono text-[11px] text-muted">{p.key}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs tabular-nums text-muted">{p.openBugs}</span>
            </Link>
          ))}
          <div className="my-1 border-t border-line" />
          <Link href={`/o/${org}`} role="menuitem" onClick={() => setOpen(false)} className="block px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
            All projects
          </Link>
        </div>
      )}
    </div>
  );
}
