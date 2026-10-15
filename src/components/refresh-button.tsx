"use client";

import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { refreshSheet } from "@/app/actions";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const wb = useSearchParams().get("wb") ?? "";
  return (
    <button
      type="button"
      onClick={() => startTransition(() => refreshSheet(wb))}
      disabled={pending}
      title="Download the latest version of the sheet"
      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-70"
    >
      {pending && <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
