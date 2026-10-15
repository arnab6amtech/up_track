"use client";

import { useState, useTransition } from "react";
import { deleteWorkbook } from "@/app/actions";

export function RemoveWorkbookButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Remove “${name}” from UpTrack? The original sheet isn't touched.`)) return;
          startTransition(async () => {
            const result = await deleteWorkbook(id);
            setError(result.error ?? null);
          });
        }}
        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-red-700 hover:border-red-400 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
