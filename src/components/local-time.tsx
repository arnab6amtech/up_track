"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Formats a timestamp in the viewer's own timezone; renders empty on the server to avoid hydration drift. */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <time dateTime={iso} className={className}>
      {onClient &&
        new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
