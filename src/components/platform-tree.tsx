"use client";

import Link from "next/link";
import { useState } from "react";
import { Chevron } from "./bug-field-select";

export interface TreeStatus {
  id: string;
  name: string;
  color: string | null;
  count: number;
  href: string;
  active: boolean;
}

export interface TreeGroup {
  key: string;
  name: string;
  total: number;
  href: string;
  /** This platform is the one being listed. */
  current: boolean;
  /** …and with every status (no status picked). */
  active: boolean;
  removed?: boolean;
  statuses: TreeStatus[];
}

/** Platforms, each opening to its bug statuses with counts. The platform being listed starts open. */
export function PlatformTree({ groups }: { groups: TreeGroup[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.filter((g) => g.current).map((g) => g.key).concat(groups.some((g) => g.current) ? [] : ["all"])));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ul className="space-y-0.5">
      {groups.map((g) => {
        const expanded = open.has(g.key);
        return (
          <li key={g.key}>
            <div
              className={`group flex items-center rounded-lg transition ${g.active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
            >
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Hide" : "Show"} ${g.name} statuses`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:text-foreground"
              >
                <Chevron className={`transition ${expanded ? "" : "-rotate-90"}`} />
              </button>
              <Link
                href={g.href}
                aria-current={g.active ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2.5 text-sm ${g.current ? "font-medium text-foreground" : "text-muted hover:text-foreground"}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {g.name}
                  {g.removed && <span className="font-normal text-muted"> (removed)</span>}
                </span>
                <span className="text-xs tabular-nums text-muted">{g.total}</span>
              </Link>
            </div>
            {expanded && (
              <ul className="mb-1 ml-[1.375rem] mt-0.5 space-y-0.5 border-l border-line pl-2">
                {g.statuses.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={s.href}
                      aria-current={s.active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition ${
                        s.active ? "bg-surface-2 font-medium text-foreground" : s.count ? "text-muted hover:bg-surface-2/60 hover:text-foreground" : "text-muted/60 hover:text-muted"
                      }`}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color ?? "#94a3b8", opacity: s.count ? 1 : 0.45 }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="text-xs tabular-nums">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
