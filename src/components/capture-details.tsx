import type { Attachment, CaptureInfo } from "@/server/bugs";
import type { MediaLink } from "@/lib/types";
import { CaptureLogPanel } from "./capture-log";

/** URL of an attachment, with the share token when viewed through a public link. */
export function attachmentUrl(id: string, shareToken?: string) {
  return `/api/attachments/${id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ""}`;
}

/** Screenshots and recordings as gallery items (the API log is shown separately). */
export function mediaLinks(
  attachments: Pick<Attachment, "id" | "kind" | "fileName" | "trimStartMs" | "trimEndMs">[],
  shareToken?: string,
): MediaLink[] {
  return attachments
    .filter((a) => a.kind === "image" || a.kind === "video")
    .map((a) => {
      const url = attachmentUrl(a.id, shareToken);
      // A media fragment plays only the trimmed part of a recording.
      const trim =
        a.kind === "video" && (a.trimStartMs != null || a.trimEndMs != null)
          ? `#t=${(a.trimStartMs ?? 0) / 1000}${a.trimEndMs != null ? `,${a.trimEndMs / 1000}` : ""}`
          : "";
      return { url, kind: a.kind as "image" | "video", src: `${url}${trim}`, label: a.fileName };
    });
}

/** Page and browser details plus the API/console log captured by the browser extension. */
export function CaptureDetails({ capture: c, shareToken }: { capture: CaptureInfo; shareToken?: string }) {
  const env: [string, React.ReactNode][] = [
    [
      "Page",
      <a key="url" href={c.pageUrl} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:opacity-70">
        {c.pageUrl}
      </a>,
    ],
    ["Page title", c.pageTitle || "—"],
    ["Browser", [c.browser, c.os].filter(Boolean).join(" · ") || "—"],
    ["Window", c.viewportWidth ? `${c.viewportWidth} × ${c.viewportHeight} at ${Number(c.devicePixelRatio ?? 1)}x` : "—"],
    ["Language", c.language || "—"],
    ["Time zone", c.timezone || "—"],
  ];
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Captured page</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
          {env.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      {c.logAttachmentId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            API calls and console{" "}
            <span className="font-normal text-muted">
              ({c.failedRequestCount} failed of {c.requestCount} · {c.consoleErrorCount} console errors)
            </span>
          </h2>
          <CaptureLogPanel logUrl={attachmentUrl(c.logAttachmentId, shareToken)} failedCount={c.failedRequestCount} />
        </section>
      )}
    </div>
  );
}
