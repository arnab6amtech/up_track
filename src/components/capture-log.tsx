"use client";

import { useEffect, useMemo, useState } from "react";
import { isFailed, type CaptureLog, type NetworkEntry } from "@/lib/capture-types";

/** Network and console log of a captured bug, loaded on demand from the capture's log file. */
export function CaptureLogPanel({ logUrl, failedCount }: { logUrl: string; failedCount: number }) {
  const [log, setLog] = useState<CaptureLog | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"network" | "console">("network");
  const [failedOnly, setFailedOnly] = useState(failedCount > 0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(logUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: CaptureLog) => !cancelled && setLog(data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [logUrl]);

  const start = log?.network.reduce((min, e) => Math.min(min, e.startedAt), Infinity) ?? 0;
  const rows = useMemo(() => {
    if (!log) return [];
    const q = query.trim().toLowerCase();
    return log.network
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => (!failedOnly || isFailed(e)) && (!q || e.url.toLowerCase().includes(q)));
  }, [log, failedOnly, query]);

  if (error) return <p className="text-sm text-muted">The log couldn&apos;t be loaded.</p>;
  if (!log) return <div className="h-32 animate-pulse rounded-xl bg-surface-2" />;

  const consoleCount = log.console.length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="tablist">
          {(
            [
              ["network", `API calls ${log.network.length}`],
              ["console", `Console ${consoleCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-md px-2.5 py-1 font-medium ${tab === key ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "network" && (
          <>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={failedOnly}
                onChange={(e) => setFailedOnly(e.target.checked)}
                className="accent-(--accent)"
              />
              Failed only ({failedCount})
            </label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by URL"
              className="ml-auto w-full rounded-md border border-line px-2.5 py-1 text-xs outline-none focus:border-accent sm:w-56"
            />
          </>
        )}
      </div>

      {tab === "network" ? (
        rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {log.network.length === 0 ? "No API calls were recorded." : "No calls match."}
          </p>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
            {rows.map(({ e, i }) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="grid w-full grid-cols-[3.25rem_3.5rem_1fr_auto] items-center gap-3 px-3 py-2 text-left text-xs hover:bg-surface-2"
                >
                  <StatusPill entry={e} />
                  <span className="font-mono font-medium">{e.method}</span>
                  <span className="min-w-0 truncate font-mono" title={e.url}>
                    <UrlText url={e.url} />
                  </span>
                  <span className="whitespace-nowrap text-muted tabular-nums">
                    {Math.round(e.durationMs)} ms · +{((e.startedAt - start) / 1000).toFixed(1)}s
                  </span>
                </button>
                {open === i && <EntryDetails entry={e} />}
              </li>
            ))}
          </ul>
        )
      ) : consoleCount === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No console errors or warnings were recorded.</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
          {log.console.map((c, i) => (
            <li key={i} className={`px-3 py-2 text-xs ${c.level === "error" ? "bg-red-50/60" : "bg-amber-50/60"}`}>
              <div className="flex items-start gap-2">
                <span
                  className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    c.level === "error" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {c.level}
                </span>
                <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono">{c.message}</pre>
              </div>
              {c.stack && (
                <pre className="mt-1.5 ml-12 whitespace-pre-wrap break-words font-mono text-muted">{c.stack}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ entry: e }: { entry: NetworkEntry }) {
  const failed = isFailed(e);
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-center font-mono font-semibold ${
        failed ? "bg-red-100 text-red-800" : e.status >= 300 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
      }`}
      title={e.error ?? e.statusText}
    >
      {e.status || "ERR"}
    </span>
  );
}

function splitUrl(url: string): { host: string; path: string; search: string } | null {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname, search: u.search };
  } catch {
    return null;
  }
}

function UrlText({ url }: { url: string }) {
  const parts = splitUrl(url);
  if (!parts) return <>{url}</>;
  return (
    <>
      <span className="text-muted">{parts.host}</span>
      {parts.path}
      <span className="text-muted">{parts.search}</span>
    </>
  );
}

function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function EntryDetails({ entry: e }: { entry: NetworkEntry }) {
  return (
    <div className="space-y-3 border-t border-line bg-surface-2/50 px-3 py-3 text-xs">
      <p className="break-all font-mono">
        <span className="font-semibold">{e.method}</span> {e.url}
      </p>
      {e.error && <p className="text-red-800">Error: {e.error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Request headers" headers={e.requestHeaders} />
        <Block title="Response headers" headers={e.responseHeaders} />
        <Block title="Request body" body={e.requestBody} />
        <Block title="Response body" body={e.responseBody} />
      </div>
    </div>
  );
}

function Block({ title, headers, body }: { title: string; headers?: Record<string, string>; body?: string }) {
  const entries = headers ? Object.entries(headers) : [];
  const empty = headers ? entries.length === 0 : !body;
  return (
    <section className="min-w-0">
      <h4 className="mb-1 font-semibold text-muted">{title}</h4>
      {empty ? (
        <p className="text-muted">—</p>
      ) : headers ? (
        <dl className="space-y-0.5 font-mono">
          {entries.map(([k, v]) => (
            <div key={k} className="break-all">
              <dt className="inline text-muted">{k}: </dt>
              <dd className="inline">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md border border-line bg-surface p-2 font-mono whitespace-pre-wrap break-all">
          {pretty(body!)}
        </pre>
      )}
    </section>
  );
}
