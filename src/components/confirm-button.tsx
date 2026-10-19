"use client";

import { useActionState } from "react";
import type { ActionState } from "@/server/actions/result";

/** A one-click action (remove, revoke) that asks first and shows its error inline. */
export function ConfirmButton({
  action,
  fields,
  confirm,
  label,
  pendingLabel,
  className = "rounded-md border border-line px-2.5 py-1 text-xs font-medium text-red-700 hover:border-red-400 disabled:opacity-50",
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  confirm?: string;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? (pendingLabel ?? label) : label}
      </button>
      {state.error && <span className="max-w-60 text-right text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
