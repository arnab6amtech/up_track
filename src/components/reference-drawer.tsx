"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tileThumb } from "@/lib/media";
import type { MediaLink } from "@/lib/types";
import { MediaGallery } from "./media-gallery";

interface Props {
  media: MediaLink[];
  title: string;
  refLabel: string;
  href: string;
}

/** Thumbnail stack shown in a list row; opens the record's images and videos in a side drawer. */
export function ReferenceButton({ media, title, refLabel, href }: Props) {
  const [open, setOpen] = useState(false);

  if (media.length === 0) return <span className="text-xs text-muted">—</span>;

  const tiles = media.slice(0, 3);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`View ${media.length} reference ${media.length === 1 ? "file" : "files"}`}
        className="relative z-10 inline-flex items-center rounded-lg border border-line bg-surface p-1 shadow-xs transition hover:border-accent hover:shadow-sm"
      >
        <span className="flex -space-x-3">
          {tiles.map((m) => (
            <Tile key={m.url} item={m} />
          ))}
        </span>
      </button>
      {open && (
        <ReferenceDrawer media={media} title={title} refLabel={refLabel} href={href} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function Tile({ item }: { item: MediaLink }) {
  const thumb = tileThumb(item);
  const [failed, setFailed] = useState(false);
  const base = "grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 ring-2 ring-white";

  if (thumb && !failed) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny external thumbnail */}
        <img
          src={thumb}
          referrerPolicy="no-referrer"
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      </span>
    );
  }

  const isVideo = item.kind === "video" || item.kind === "probe" || item.video;
  return (
    <span className={`${base} ${isVideo ? "bg-neutral-900 text-white" : "text-muted"}`}>
      {isVideo ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
          <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path
            fillRule="evenodd"
            d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .41.34.75.75.75h13.5c.41 0 .75-.34.75-.75v-2.69l-2.22-2.22a.75.75 0 0 0-1.06 0l-1.91 1.9.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.84a.75.75 0 0 0-1.06 0l-2.97 2.22ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </span>
  );
}

function ReferenceDrawer({ media, title, refLabel, href, onClose }: Props & { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let an open image lightbox take Esc first.
      if (e.key === "Escape" && !document.querySelector("[data-lightbox]")) onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 text-left" role="dialog" aria-modal="true" aria-label="Reference">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 transition-opacity duration-200 starting:opacity-0"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-surface shadow-2xl transition-transform duration-200 ease-out starting:translate-x-full">
        <header className="flex items-start gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              Reference · <span className="font-mono">{refLabel}</span> · {media.length}{" "}
              {media.length === 1 ? "file" : "files"}
            </p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <MediaGallery items={media} stacked />
        </div>
        <footer className="border-t border-line px-5 py-3">
          <Link
            href={href}
            className="block rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-neutral-800"
          >
            Open full details
          </Link>
        </footer>
      </aside>
    </div>
  );
}
