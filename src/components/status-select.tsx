"use client";

import { useEffect, useRef, useState } from "react";
import { RESOLUTION_LABEL } from "@/lib/labels";
import { Chevron, useBugSave, type BugRef } from "./bug-field-select";

export interface StatusOption {
  id: string;
  name: string;
  category: string;
  color: string | null;
}

interface Props extends BugRef {
  statusId: string;
  resolution: string | null;
  statuses: StatusOption[];
  /** Closing a bug (a "done" status) is for SQA engineers and managers. */
  canVerify: boolean;
}

/**
 * A bug's status in the list, changed in place. Moving to a done status asks for the resolution first.
 * The list remounts it (keyed by lock version) after each save, so it always starts from the stored state.
 */
export function StatusSelect({ statusId, resolution, statuses, canVerify, ...ref }: Props) {
  const [value, setValue] = useState(statusId);
  const [closing, setClosing] = useState<StatusOption | null>(null);
  const { pending, error, save: saveFields } = useBugSave(ref);
  const current = statuses.find((s) => s.id === value);

  function save(targetId: string, newResolution?: string) {
    setClosing(null);
    setValue(targetId);
    saveFields(
      {
        statusId: targetId,
        ...(newResolution ? { resolution: newResolution } : {}),
      },
      () => setValue(statusId),
    );
  }

  function choose(targetId: string) {
    const target = statuses.find((s) => s.id === targetId);
    if (!target || targetId === value) return;
    if (target.category === "done") setClosing(target);
    else save(targetId);
  }

  return (
    // Above the row link's overlay; while the prompt is open, above the following rows too.
    <div className={`relative inline-block max-w-full ${closing ? "z-30" : "z-10"}`}>
      {/* The resolution sits beside the pill, wrapping under it where the column is narrow. */}
      <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5">
        <div className="relative inline-flex max-w-full items-center">
          <span className="pointer-events-none absolute left-2 size-2 rounded-full" style={{ background: current?.color ?? "#94a3b8" }} aria-hidden />
          <select
            value={value}
            onChange={(e) => choose(e.target.value)}
            disabled={pending}
            aria-label="Status"
            className="field-sizing-content max-w-full cursor-pointer appearance-none truncate rounded-full border border-transparent bg-surface-2 py-0.5 pl-5 pr-6 text-xs font-medium outline-none transition hover:border-line focus-visible:border-accent disabled:cursor-wait disabled:opacity-60"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id} disabled={s.category === "done" && !canVerify && s.id !== statusId}>
                {s.name}
                {s.category === "done" && !canVerify ? " (SQA closes)" : ""}
              </option>
            ))}
          </select>
          <Chevron className="absolute right-1.5" />
        </div>
        {resolution && current?.category === "done" && <span className="text-xs text-muted">{RESOLUTION_LABEL[resolution] ?? resolution}</span>}
      </div>
      {error && <p className="mt-1 max-w-56 text-xs text-red-700">{error}</p>}
      {closing && <ResolutionPrompt status={closing} onCancel={() => setClosing(null)} onConfirm={(r) => save(closing.id, r)} />}
    </div>
  );
}

/** Asks how the bug was resolved before closing it. */
function ResolutionPrompt({ status, onCancel, onConfirm }: { status: StatusOption; onCancel: () => void; onConfirm: (resolution: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState("fixed");

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCancel();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Move to ${status.name}`}
      className="absolute right-0 top-full z-20 mt-1 w-56 space-y-2.5 rounded-lg border border-line bg-surface p-3 text-left shadow-lg md:left-0 md:right-auto"
    >
      <label className="block space-y-1 text-xs">
        <span className="font-medium">Resolution</span>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          {Object.entries(RESOLUTION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(resolution)}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Move to {status.name}
        </button>
      </div>
    </div>
  );
}
