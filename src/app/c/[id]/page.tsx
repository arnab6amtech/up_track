import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaptureDetails } from "@/components/capture-details";
import { MediaGallery } from "@/components/media-gallery";
import { ShareLinkBar } from "@/components/share-link";
import { StatusBadge } from "@/components/status-badge";
import { CAPTURES_WORKBOOK_ID } from "@/lib/capture-types";
import { captureToRecord, getCapture } from "@/lib/captures";
import { publicOrigin } from "@/lib/origin";

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const capture = await getCapture((await params).id);
  return {
    title: capture ? `${capture.title} — UpTrack` : "Bug not found — UpTrack",
    // Share links are private by obscurity; keep them out of search engines.
    robots: { index: false, follow: false },
  };
}

export default function SharedBugPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
      <SharedBug params={params} />
    </Suspense>
  );
}

async function SharedBug({ params }: Pick<PageProps<"/c/[id]">, "params">) {
  const { id } = await params;
  const capture = await getCapture(id);
  if (!capture) notFound();
  const record = captureToRecord(capture);
  const base = await publicOrigin();

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Reported bug <span className="font-mono">#{capture.number}</span> · by {capture.reporter}
        </p>
        <Link
          href={`/bug/${record.id}?wb=${CAPTURES_WORKBOOK_ID}`}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
        >
          Open in bug list
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <header className="space-y-3 rounded-xl border border-line bg-surface p-5">
            {capture.module && <p className="text-xs font-medium">{capture.module}</p>}
            <h1 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{capture.title}</h1>
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={capture.status} />
              {capture.severity && <StatusBadge value={capture.severity} />}
              {capture.priority && <StatusBadge value={`${capture.priority} priority`} />}
            </div>
            <ShareLinkBar url={`${base}/c/${capture.id}`} />
          </header>
          <CaptureDetails capture={capture} />
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold">{capture.media[0]?.kind === "video" ? "Recording" : "Screenshot"}</h2>
          <MediaGallery items={record.media} stacked />
        </aside>
      </div>
    </article>
  );
}
