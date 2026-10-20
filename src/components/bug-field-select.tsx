"use client";

import { useState, useTransition } from "react";
import { updateBugAction } from "@/server/actions/project";

/** Identifies the bug a change applies to; the lock version stops it overwriting someone else's edit. */
export interface BugRef {
  org: string;
  project: string;
  bugId: string;
  lockVersion: number;
}

/**
 * Saves a few fields of a bug through the same action as the bug page, and reports the error, if any.
 * The page refreshes afterwards, and callers are keyed by lock version so they start from the stored state.
 */
export function useBugSave(ref: BugRef) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (fields: Record<string, string>, onFail: () => void) => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("org", ref.org);
      form.set("project", ref.project);
      form.set("bugId", ref.bugId);
      form.set("lockVersion", String(ref.lockVersion));
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      const result = await updateBugAction({}, form);
      if (result.error) {
        onFail();
        setError(result.error);
      }
    });
  };
  return { pending, error, save };
}

export const Chevron = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={`pointer-events-none size-3.5 text-muted ${className}`} aria-hidden>
    <path
      fillRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
);

interface Props extends BugRef {
  /** The form field updateBugAction reads, e.g. "severity" or "assigneeId". */
  field: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  /** "pill" for the badges under the title; "inline" for the values in the details list. */
  variant: "pill" | "inline";
  /** Pill colors per value, e.g. the severity tones. */
  tones?: Record<string, string>;
}

/** One field of a bug, changed in place: picking a value saves it. */
export function BugFieldSelect({ field, value: stored, options, label, variant, tones, ...ref }: Props) {
  const [value, setValue] = useState(stored);
  const { pending, error, save } = useBugSave(ref);

  const choose = (next: string) => {
    if (next === value) return;
    setValue(next);
    save({ [field]: next }, () => setValue(stored));
  };

  const look =
    variant === "pill"
      ? `rounded-full py-0.5 pl-2.5 pr-6 text-xs font-medium ${tones?.[value] ?? "bg-surface-2"} border border-transparent hover:border-line`
      : "rounded-md px-1.5 py-0.5 text-sm hover:bg-surface-2";

  // The chosen value is plain text, so it sizes itself in the page's font; an invisible select on top
  // takes clicks and keys. (A select sized to its own text measures it in another font and cuts it off.)
  return (
    // Inline values shift left by their padding so the text lines up with the plain values around them. A
    // relative offset rather than a negative margin: a margin would shrink the space the value is given.
    <span className={`inline-block max-w-full align-middle ${variant === "inline" ? "relative -left-1.5" : ""}`}>
      <span
        title={label}
        className={`relative inline-flex max-w-full cursor-pointer items-center transition has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-accent/20 ${pending ? "cursor-wait opacity-60" : ""} ${look}`}
      >
        <span className="truncate">{options.find((o) => o.value === value)?.label ?? ""}</span>
        {/* Pills show an arrow; inline values just highlight on hover. */}
        {variant === "pill" && <Chevron className="absolute right-1.5" />}
        <select
          value={value}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-wait"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      {error && <span className="mt-1 block max-w-64 text-xs text-red-700">{error}</span>}
    </span>
  );
}
