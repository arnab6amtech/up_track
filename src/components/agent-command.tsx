"use client";

import { useState } from "react";

/**
 * The slash command that runs UpTrack's fix-bug prompt, as the Claude Code VS Code extension lists it.
 * The workbook is only added when it isn't the default, since the prompt falls back to the main one.
 */
export function fixBugCommand(id: string, workbook?: string): string {
  return `/uptrack:fix-bug ${id}${workbook ? ` ${workbook}` : ""}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs HTTPS (or localhost); fall back for plain-HTTP deployments.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Copies `text` on demand and reports "copied" / "failed" for a moment. */
export function useCopy(text: string) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1600);
  };
  return { state, copy };
}

function SparkleIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M15.98 1.8a.75.75 0 0 0-1.46 0l-.25 1.04a2.25 2.25 0 0 1-1.64 1.64l-1.04.25a.75.75 0 0 0 0 1.46l1.04.25a2.25 2.25 0 0 1 1.64 1.64l.25 1.04a.75.75 0 0 0 1.46 0l.25-1.04a2.25 2.25 0 0 1 1.64-1.64l1.04-.25a.75.75 0 0 0 0-1.46l-1.04-.25a2.25 2.25 0 0 1-1.64-1.64l-.25-1.04ZM7.5 5.75a.75.75 0 0 1 .71.51l.64 1.93a3.75 3.75 0 0 0 2.37 2.37l1.93.64a.75.75 0 0 1 0 1.42l-1.93.64a3.75 3.75 0 0 0-2.37 2.37l-.64 1.93a.75.75 0 0 1-1.42 0l-.64-1.93a3.75 3.75 0 0 0-2.37-2.37l-1.93-.64a.75.75 0 0 1 0-1.42l1.93-.64a3.75 3.75 0 0 0 2.37-2.37l.64-1.93a.75.75 0 0 1 .71-.51Z" />
    </svg>
  );
}

/** Small button for list rows. Sits above the row's stretched link. */
export function CopyFixButton({ id, workbook }: { id: string; workbook?: string }) {
  const command = fixBugCommand(id, workbook);
  const { state, copy } = useCopy(command);
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy “${command}” to paste into your AI agent`}
      aria-label={`Copy fix command for ${id}`}
      className={`relative z-10 inline-flex h-7 w-16 items-center justify-center rounded-md border text-xs font-medium transition ${
        state === "copied" ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"
      }`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Fix"}
    </button>
  );
}

/** Full-width version for the details page: shows the command itself next to the copy button. */
export function AgentCommandBar({ id, workbook }: { id: string; workbook?: string }) {
  const command = fixBugCommand(id, workbook);
  const { state, copy } = useCopy(command);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
        <SparkleIcon />
        Fix with your AI agent
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={command}>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${
          state === "copied" ? "bg-emerald-600 text-white" : "bg-accent text-white hover:bg-neutral-800"
        }`}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy command"}
      </button>
    </div>
  );
}
