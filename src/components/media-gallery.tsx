"use client";

import { useEffect, useState } from "react";
import type { MediaLink } from "@/lib/types";

/** `stacked` keeps one column, for narrow places like the details sidebar and the drawer. */
export function MediaGallery({ items, stacked = false }: { items: MediaLink[]; stacked?: boolean }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        No screenshot or video was attached to this record.
      </p>
    );
  }

  return (
    <>
      <div className={`grid gap-4 ${items.length > 1 && !stacked ? "lg:grid-cols-2" : ""}`}>
        {items.map((m, i) => (
          <figure key={m.url} className="overflow-hidden rounded-lg border border-line bg-surface">
            <MediaView item={m} onZoom={setLightbox} />
            <figcaption className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-muted" title={m.url}>
                <span className="mr-1.5 font-medium text-foreground">{i + 1}.</span>
                {m.label ?? describe(m)}
              </span>
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-medium underline underline-offset-2 hover:opacity-70"
              >
                Open original
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

function describe(m: MediaLink): string {
  try {
    const u = new URL(m.url);
    if (m.kind === "drive") return "Google Drive file";
    const file = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return /\.\w{2,4}$/.test(file) ? file : u.hostname;
  } catch {
    return m.url;
  }
}

function MediaView({ item, onZoom }: { item: MediaLink; onZoom: (src: string) => void }) {
  // "probe" links have no file extension: try image, then video, then give up and show a link.
  const [fallback, setFallback] = useState<"image" | "video" | "link">("image");
  const kind = item.kind === "probe" ? fallback : item.kind;

  switch (kind) {
    case "drive":
      return <DriveView item={item} onZoom={onZoom} />;
    case "image":
      return (
        <button
          type="button"
          onClick={() => onZoom(item.src)}
          className="block w-full cursor-zoom-in bg-surface-2"
          title="Click to enlarge"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external reference of unknown size */}
          <img
            referrerPolicy="no-referrer"
            src={item.src}
            alt={item.label ?? "QA reference"}
            loading="lazy"
            onError={() => item.kind === "probe" && setFallback("video")}
            className="mx-auto max-h-[70vh] w-auto object-contain"
          />
        </button>
      );
    case "video":
      return (
        <video
          src={item.src}
          controls
          playsInline
          preload="metadata"
          onError={() => item.kind === "probe" && setFallback("link")}
          className="aspect-video w-full bg-black"
        />
      );
    default:
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-4 py-6 text-sm hover:bg-surface-2"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-5 shrink-0 text-muted" aria-hidden>
            <path d="M12.23 3.47a3.75 3.75 0 0 1 5.3 5.3l-2.5 2.5a3.75 3.75 0 0 1-5.3 0 .75.75 0 0 1 1.06-1.06 2.25 2.25 0 0 0 3.18 0l2.5-2.5a2.25 2.25 0 0 0-3.18-3.18l-1.25 1.25a.75.75 0 0 1-1.06-1.06l1.25-1.25Zm-4.46 4.46a3.75 3.75 0 0 1 5.3 0 .75.75 0 0 1-1.06 1.06 2.25 2.25 0 0 0-3.18 0l-2.5 2.5a2.25 2.25 0 0 0 3.18 3.18l1.25-1.25a.75.75 0 1 1 1.06 1.06l-1.25 1.25a3.75 3.75 0 0 1-5.3-5.3l2.5-2.5Z" />
          </svg>
          <span className="min-w-0 break-all underline underline-offset-2">{item.url}</span>
        </a>
      );
  }
}

function DriveView({ item, onZoom }: { item: MediaLink; onZoom: (src: string) => void }) {
  // Start on the still image (fast, works without Drive cookies); switch to Drive's player for videos.
  const [player, setPlayer] = useState(item.video || !item.thumb);

  if (player) {
    return (
      <div className="relative aspect-video bg-black">
        <iframe
          src={item.src}
          title={item.label ?? "Google Drive preview"}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      </div>
    );
  }

  return (
    <div className="relative bg-surface-2">
      <button type="button" onClick={() => onZoom(item.thumb!)} className="block w-full cursor-zoom-in" title="Click to enlarge">
        {/* eslint-disable-next-line @next/next/no-img-element -- external reference of unknown size */}
        <img
          src={item.thumb}
          referrerPolicy="no-referrer"
          alt={item.label ?? "QA reference"}
          loading="lazy"
          onError={() => setPlayer(true)}
          className="mx-auto max-h-[70vh] w-auto object-contain"
        />
      </button>
      <button
        type="button"
        onClick={() => setPlayer(true)}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-black"
        title="Load Drive's player (for videos)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
          <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
        </svg>
        Play in Drive
      </button>
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-lightbox
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/85 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external reference of unknown size */}
      <img src={src} referrerPolicy="no-referrer" alt="Enlarged reference" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
