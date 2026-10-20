"use client";

import { useState } from "react";
import { Avatar } from "./avatar";
import { useBugSave, type BugRef } from "./bug-field-select";

export interface AssigneeOption {
  id: string;
  name: string;
}

interface Props extends BugRef {
  assigneeId: string | null;
  assigneeName: string | null;
  /** Who it can go to: everyone on the project for people who assign, else just the person themselves. */
  options: AssigneeOption[];
  /** Whether "Nobody" is a choice (people who assign, or while nobody has it). */
  canUnassign: boolean;
}

/**
 * A bug's assignee in the list: their avatar (a dashed circle for nobody), opening the choices on click.
 * The list remounts it (keyed by lock version) after each save, so it starts from the stored assignee.
 */
export function AssigneeSelect({ assigneeId, assigneeName, options, canUnassign, ...ref }: Props) {
  const [value, setValue] = useState(assigneeId ?? "");
  const { pending, error, save } = useBugSave(ref);
  // The current assignee stays listed even if they left the project.
  const choices = assigneeId && !options.some((o) => o.id === assigneeId) ? [{ id: assigneeId, name: assigneeName ?? "Former member" }, ...options] : options;
  const current = choices.find((o) => o.id === value);
  const label = current ? `Assigned to ${current.name}` : "Unassigned";

  const choose = (next: string) => {
    if (next === value) return;
    setValue(next);
    save({ assigneeId: next }, () => setValue(assigneeId ?? ""));
  };

  return (
    // Above the row's link overlay, so clicks reach the select.
    <span className="relative z-10 inline-flex flex-col items-end">
      <span
        title={error ?? label}
        className={`relative grid size-7 place-items-center rounded-full transition hover:ring-2 hover:ring-line has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-accent/30 ${
          pending ? "opacity-50" : ""
        } ${error ? "ring-2 ring-red-300" : ""}`}
      >
        {current ? (
          <Avatar id={current.id} name={current.name} size="sm" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full border border-dashed border-neutral-400 text-muted" aria-hidden>
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
            </svg>
          </span>
        )}
        <select
          value={value}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label={`Assignee: ${current?.name ?? "nobody"}`}
          className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-wait"
        >
          {(canUnassign || !value) && <option value="">Nobody</option>}
          {choices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </span>
      {error && <span className="mt-1 max-w-44 text-right text-xs text-red-700">{error}</span>}
    </span>
  );
}
