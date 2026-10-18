"use client";

import { useFormStatus } from "react-dom";

/** Shared form styles, so every page's fields and buttons look the same. */
export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10";
export const selectClass = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50";

export function SubmitButton({
  children,
  pendingText,
  className = primaryButtonClass,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} name={name} value={value}>
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (success) {
    return <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>;
  }
  return null;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
