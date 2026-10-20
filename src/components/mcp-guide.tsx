"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CopyBlock } from "./copy-block";

const SEEN_KEY = "uptrack-mcp-guide-seen";
const noopSubscribe = () => () => {};

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // Storage blocked: don't nag with a dot we can never clear.
  }
}

const EXAMPLES = [
  "What's still open? Group it by feature.",
  "Fix UPT-12. Look at the screenshot first.",
  "Is the login timeout bug already fixed in this repo?",
];

/** Floating button that tells people about the MCP server and how to hook up their coding agent. */
export function McpGuide({ publicUrl }: { publicUrl: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"connect" | "use">("connect");
  const [seenNow, setSeenNow] = useState(false);
  const storedSeen = useSyncExternalStore(noopSubscribe, readSeen, () => true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The full guide is already on screen there.
  if (pathname === "/connect") return null;

  const toggle = () => {
    setOpen((o) => !o);
    if (!seenNow) {
      setSeenNow(true);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
    }
  };

  const showDot = !storedSeen && !seenNow;

  return (
    <div ref={root} className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3">
      {open && <Panel tab={tab} setTab={setTab} publicUrl={publicUrl} onClose={() => setOpen(false)} />}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="relative inline-flex items-center gap-2 rounded-full bg-accent py-2.5 pl-3.5 pr-4 text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:bg-neutral-800"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path d="M15.98 1.8a.75.75 0 0 0-1.46 0l-.25 1.04a2.25 2.25 0 0 1-1.64 1.64l-1.04.25a.75.75 0 0 0 0 1.46l1.04.25a2.25 2.25 0 0 1 1.64 1.64l.25 1.04a.75.75 0 0 0 1.46 0l.25-1.04a2.25 2.25 0 0 1 1.64-1.64l1.04-.25a.75.75 0 0 0 0-1.46l-1.04-.25a2.25 2.25 0 0 1-1.64-1.64l-.25-1.04ZM7.5 5.75a.75.75 0 0 1 .71.51l.64 1.93a3.75 3.75 0 0 0 2.37 2.37l1.93.64a.75.75 0 0 1 0 1.42l-1.93.64a3.75 3.75 0 0 0-2.37 2.37l-.64 1.93a.75.75 0 0 1-1.42 0l-.64-1.93a3.75 3.75 0 0 0-2.37-2.37l-1.93-.64a.75.75 0 0 1 0-1.42l1.93-.64a3.75 3.75 0 0 0 2.37-2.37l.64-1.93a.75.75 0 0 1 .71-.51Z" />
        </svg>
        {open ? "Close" : "Use with your AI agent"}
        {showDot && (
          <span className="absolute -right-0.5 -top-0.5 flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full border-2 border-white bg-red-500" />
          </span>
        )}
      </button>
    </div>
  );
}

function Panel({
  tab,
  setTab,
  publicUrl,
  onClose,
}: {
  tab: "connect" | "use";
  setTab: (t: "connect" | "use") => void;
  publicUrl: string | null;
  onClose: () => void;
}) {
  // Only rendered after a click, so reading window here can't cause a hydration mismatch.
  const url = `${publicUrl ?? window.location.origin}/api/mcp`;

  return (
    <div
      role="dialog"
      aria-label="Use UpTrack with your AI agent"
      className="flex max-h-[min(640px,calc(100vh-6rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl transition duration-150 starting:translate-y-2 starting:opacity-0"
    >
      <header className="border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Use UpTrack with your AI agent</h2>
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            MCP
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Connect Claude Code, Cursor or Copilot to UpTrack. Your agent can then read QA&apos;s bugs and see their
          screenshots while it fixes your code.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-line p-0.5 text-xs" role="tablist">
          {(["connect", "use"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 font-medium ${
                tab === t ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {t === "connect" ? "How to connect" : "How to use"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs leading-relaxed">

        {tab === "connect" ? (
          <ol className="space-y-4">
            <Step n={1} title="Get your token">
              <p>Create a token under <span className="font-medium">API tokens</span> (in your avatar menu), then add it to your shell profile:</p>
              <CopyBlock label="~/.zshrc" code="export UPTRACK_TOKEN=paste-your-token-here" />
            </Step>
            <Step n={2} title="Add UpTrack to your agent">
              <p>In the codebase you&apos;re fixing, run:</p>
              <CopyBlock
                wrap
                label="terminal"
                code={`claude mcp add --transport http uptrack ${url} \\\n  --header "Authorization: Bearer $UPTRACK_TOKEN"`}
              />
              <p className="text-muted">
                Type <code className="font-mono">$UPTRACK_TOKEN</code> exactly as shown. Don&apos;t paste your token
                there; the shell fills it in from step 1.
              </p>
              <p className="text-muted">
                Setting it up for the whole team, or using Cursor or Copilot? The full guide has a .mcp.json to commit.
              </p>
            </Step>
            <Step n={3} title="Check it's connected">
              <p>
                Restart Claude Code and run <code className="font-mono">/mcp</code>. You should see{" "}
                <span className="font-medium">uptrack</span> listed as connected.
              </p>
            </Step>
          </ol>
        ) : (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="font-semibold">Ask in plain words</h3>
              <ul className="space-y-1.5">
                {EXAMPLES.map((e) => (
                  <li key={e} className="rounded-md bg-surface-2 px-2.5 py-1.5 font-mono">
                    {e}
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Or use the ready-made prompt</h3>
              <CopyBlock label="Claude Code" code="/mcp__uptrack__fix-bug UPT-12" />
              <p className="text-muted">
                In the VS Code extension it&apos;s listed as <code className="font-mono">/uptrack:fix-bug</code>. Add a
                bug ID, a TC ID or a few words, or leave it empty to pick from the open bugs. It reads the bug, looks at
                the screenshots, fixes the code, and ends with a Dev Remarks line you can paste into the sheet.
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Good to know</h3>
              <ul className="list-disc space-y-1 pl-4 text-muted">
                <li>
                  Each bug page has a Copy command button with its key (like <span className="font-mono">UPT-12</span>), or just describe the bug.
                </li>
                <li>The agent can read but not change the sheet. Update Dev Status yourself.</li>
                <li>Videos can&apos;t be watched by the agent; it gets the link and a still frame where possible.</li>
              </ul>
            </section>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={onClose} className="text-xs font-medium text-muted hover:text-foreground">
          Not now
        </button>
        <Link
          href="/connect"
          onClick={onClose}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Full setup guide
        </Link>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-semibold">{title}</h3>
        {children}
      </div>
    </li>
  );
}
