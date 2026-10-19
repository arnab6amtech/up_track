import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaptureDetails, mediaLinks } from "@/components/capture-details";
import { LocalTime } from "@/components/local-time";
import { MediaGallery } from "@/components/media-gallery";
import { RichText } from "@/components/rich-text";
import { PriorityBadge, SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { RESOLUTION_LABEL } from "@/lib/labels";
import { openSharedBug } from "@/server/bugs";

export const metadata: Metadata = {
  title: "Shared bug — UpTrack",
  // Share links are private by obscurity; keep them out of search engines.
  robots: { index: false, follow: false },
};

export default function SharedBugPage({ params }: PageProps<"/s/[token]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
      <SharedBug params={params} />
    </Suspense>
  );
}

const SECTIONS = [
  ["description", "Description"],
  ["stepsToReproduce", "Steps to reproduce"],
  ["expectedResult", "Expected result"],
  ["actualResult", "Actual result"],
  ["environment", "Environment"],
] as const;

async function SharedBug({ params }: Pick<PageProps<"/s/[token]">, "params">) {
  const { token } = await params;
  const bug = await openSharedBug(token);
  if (!bug) notFound();
  const media = mediaLinks(bug.attachments, token);
  const sections = SECTIONS.filter(([key]) => bug[key]);

  return (
    <article className="space-y-6">
      <p className="text-xs text-muted">
        Shared bug report · <span className="font-mono">{bug.projectKey}-{bug.number}</span> in {bug.projectName}
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <header className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h1 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{bug.title}</h1>
            <div className="flex flex-wrap gap-2">
              <StatusPill name={bug.resolution ? `${bug.statusName} · ${RESOLUTION_LABEL[bug.resolution]}` : bug.statusName} color={bug.statusColor} />
              <SeverityBadge value={bug.severity} />
              <PriorityBadge value={bug.priority} />
            </div>
            <p className="text-sm text-muted">
              Found in {bug.foundInVersionName}
              {bug.componentName && <> · {bug.componentName}</>} · reported by {bug.reporterName},{" "}
              <LocalTime iso={new Date(bug.createdAt).toISOString()} />
            </p>
          </header>
          {sections.length > 0 && (
            <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
              {sections.map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <h2 className="text-sm font-medium">{label}</h2>
                  <RichText text={bug[key] ?? ""} />
                </div>
              ))}
            </section>
          )}
          {bug.capture && <CaptureDetails capture={bug.capture} shareToken={token} />}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold">Reference ({media.length})</h2>
          <MediaGallery items={media} stacked />
        </aside>
      </div>
    </article>
  );
}
