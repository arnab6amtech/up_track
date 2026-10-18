import { describeUserAgent, type Capture } from "@/lib/capture-types";
import { captureFileUrl } from "@/lib/captures";
import { CaptureLogPanel } from "./capture-log";
import { LocalTime } from "./local-time";
import { RichText } from "./rich-text";

/** Description, environment and API/console log of a bug reported with the browser extension. */
export function CaptureDetails({ capture: c }: { capture: Capture }) {
  const env: [string, React.ReactNode][] = [
    ["Page", <a key="url" href={c.page.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:opacity-70">{c.page.url}</a>],
    ["Page title", c.page.title || "—"],
    ["Browser", describeUserAgent(c.page.userAgent)],
    ["Window", `${c.page.viewport.width} × ${c.page.viewport.height} at ${c.page.devicePixelRatio}x`],
    ["Language", c.page.language],
    ["Time zone", c.page.timezone],
    ["Reported", <LocalTime key="at" iso={c.createdAt} />],
    ["Reporter", c.reporter],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Description</h2>
        <RichText text={c.description} />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Environment</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          {env.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          API calls and console{" "}
          <span className="font-normal text-muted">
            ({c.counts.failedRequests} failed of {c.counts.requests} · {c.counts.consoleErrors} console errors)
          </span>
        </h2>
        <CaptureLogPanel logUrl={captureFileUrl(c.id, "log.json")} failedCount={c.counts.failedRequests} />
      </section>
    </div>
  );
}
