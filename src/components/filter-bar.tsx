"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { filtersToQuery, type FacetOption, type Filters } from "@/lib/filters";

type SelectKey = "module" | "status" | "dev" | "developer" | "sev" | "prio";

export interface FilterField {
  key: SelectKey;
  label: string;
  options: FacetOption[];
}

export function FilterBar({ filters, fields }: { filters: Filters; fields: FilterField[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  // The last search this component sent, and the URL value it last saw.
  const [pushedQ, setPushedQ] = useState(filters.q);
  const [seenQ, setSeenQ] = useState(filters.q);

  // The URL changed from elsewhere (back button, chips, clear): mirror it in the box,
  // unless it's just our own debounced push catching up while the user keeps typing.
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (filters.q !== pushedQ) {
      setQ(filters.q);
      setPushedQ(filters.q);
    }
  }

  const go = (overrides: Partial<Filters>) =>
    startTransition(() => router.push(`/sheets${filtersToQuery(filters, { ...overrides, page: 1 })}`, { scroll: false }));

  // Debounced search so each keystroke doesn't trigger a server render.
  useEffect(() => {
    const next = q.trim();
    if (next === pushedQ) return;
    const t = setTimeout(() => {
      setPushedQ(next);
      startTransition(() => router.replace(`/sheets${filtersToQuery(filters, { q: next, page: 1 })}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, pushedQ, filters, router]);

  const active = fields.some((f) => filters[f.key]) || filters.q || filters.media;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bug details, remarks, module, TC ID…"
          className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
        {pending && (
          <span className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {fields.map((f) =>
          f.options.length === 0 ? null : (
            <label key={f.key}>
              <span className="sr-only">{f.label}</span>
              <select
                value={filters[f.key]}
                onChange={(e) => go({ [f.key]: e.target.value })}
                className={`max-w-48 cursor-pointer appearance-none rounded-md border px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/20 ${
                  filters[f.key] ? "border-accent font-medium" : "border-line hover:border-neutral-400"
                }`}
              >
                <option value="">{f.label}: All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {f.label}: {o.value} ({o.count})
                  </option>
                ))}
              </select>
            </label>
          ),
        )}

        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1.5 text-xs ${
            filters.media ? "border-accent font-medium" : "border-line hover:border-neutral-400"
          }`}
        >
          <input
            type="checkbox"
            checked={filters.media}
            onChange={(e) => go({ media: e.target.checked })}
            className="accent-(--accent)"
          />
          Has reference
        </label>

        <button
          type="button"
          onClick={() => go({ order: filters.order === "desc" ? "asc" : "desc" })}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs hover:border-neutral-400"
          title="Sheet order: top to bottom, or newest rows (bottom of the sheet) first"
        >
          {filters.order === "desc" ? "Newest rows first" : "Sheet order"}
        </button>

        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPushedQ("");
              go({ q: "", module: "", status: "", dev: "", developer: "", sev: "", prio: "", media: false });
            }}
            className="px-1.5 py-1.5 text-xs font-medium underline underline-offset-2 hover:opacity-70"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
