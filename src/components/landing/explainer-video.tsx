"use client";

import { useRef, useState } from "react";

/**
 * The product tour. Nothing downloads until someone presses play (just the poster); then the browser picks
 * the AV1 version where it can, else the MP4. Captions are part of the picture, so it works without sound.
 */
export function ExplainerVideo({ poster, mp4, webm, label }: { poster: string; mp4: string; webm?: string; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const play = () => {
    setStarted(true);
    void video.current?.play();
  };

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-100">
      <video
        ref={video}
        className="size-full"
        poster={poster}
        preload="none"
        playsInline
        controls={started}
        onPlay={() => setStarted(true)}
        aria-label={label}
      >
        {webm && <source src={webm} type='video/webm; codecs="av01.0.08M.08"' />}
        <source src={mp4} type="video/mp4" />
      </video>
      {!started && (
        <button type="button" onClick={play} className="group absolute inset-0 grid place-items-center bg-black/5 transition hover:bg-black/10" aria-label={`Play: ${label}`}>
          <span className="flex items-center gap-3 rounded-full bg-neutral-950/90 py-3 pl-3 pr-6 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10 backdrop-blur transition group-hover:scale-105 sm:py-4 sm:pl-4 sm:pr-7">
            <span className="grid size-10 place-items-center rounded-full bg-white text-neutral-950 sm:size-12">
              <svg viewBox="0 0 20 20" fill="currentColor" className="ml-0.5 size-5 sm:size-6" aria-hidden>
                <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
              </svg>
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold sm:text-base">Watch the tour</span>
              <span className="block text-xs text-white/70">1:18 · captions on screen</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
