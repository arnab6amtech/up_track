"use client";

import { useCopy } from "./agent-command";

export function ShareLinkBar({ url }: { url: string }) {
  const { state, copy } = useCopy(url);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <span className="text-xs font-medium">Share link</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={url}>
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${
          state === "copied" ? "bg-emerald-600 text-white" : "bg-accent text-white hover:bg-neutral-800"
        }`}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy link"}
      </button>
    </div>
  );
}
