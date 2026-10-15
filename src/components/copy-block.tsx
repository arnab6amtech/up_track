"use client";

import { useState } from "react";

/** A code snippet with a copy button. `wrap` breaks long lines instead of scrolling, for narrow panels. */
export function CopyBlock({ label, code, wrap = false }: { label: string; code: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-xs text-muted">{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium hover:border-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`bg-surface p-3 font-mono text-xs leading-relaxed ${wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto"}`}
      >
        {code}
      </pre>
    </div>
  );
}
