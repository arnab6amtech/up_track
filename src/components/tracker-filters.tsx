"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Value meaning "no filter"; shown as "<label>: All". */
  allValue?: string;
}

/** Search box plus filter dropdowns that live in the URL, so filtered views can be shared. */
export function TrackerFilters({
  basePath,
  values,
  selects,
  placeholder,
}: {
  basePath: string;
  values: Record<string, string>;
  selects: FilterSelect[];
  placeholder: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(values.q ?? "");
  const [pushedQ, setPushedQ] = useState(values.q ?? "");

  const go = (patch: Record<string, string>, replace = false) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...values, ...patch, page: "" })) if (v) next.set(k, v);
    const url = `${basePath}${next.size ? `?${next}` : ""}`;
    startTransition(() => (replace ? router.replace(url, { scroll: false }) : router.push(url, { scroll: false })));
  };

  useEffect(() => {
    const value = q.trim();
    if (value === pushedQ) return;
    const t = setTimeout(() => {
      setPushedQ(value);
      go({ q: value }, true);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` changes every render; q and pushedQ drive this.
  }, [q, pushedQ]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
        {pending && (
          <span className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selects.map((s) => {
          const value = values[s.name] ?? "";
          const active = value && value !== (s.allValue ?? "");
          return (
            <select
              key={s.name}
              value={value}
              onChange={(e) => go({ [s.name]: e.target.value })}
              aria-label={s.label}
              className={`max-w-52 cursor-pointer appearance-none rounded-md border bg-surface px-2.5 py-1.5 text-xs outline-none ${
                active ? "border-accent font-medium" : "border-line hover:border-neutral-400"
              }`}
            >
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {s.label}: {o.label}
                </option>
              ))}
            </select>
          );
        })}
      </div>
    </div>
  );
}
