"use client";

import { useActionState, useState } from "react";
import { addSeverityAction, addStatusAction, updateSeverityAction, updateStatusAction, workflowRowAction } from "@/server/actions/workflow";
import type { ActionState } from "@/server/actions/result";
import { SubmitButton } from "./form";

type List = "status" | "severity";

export interface WorkflowEntry {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  bugCount: number;
  /** Statuses only. */
  category?: string;
}

const CATEGORIES = [
  { value: "open", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
];

const field =
  "h-8 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-line focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/10";
const addField = "h-9 rounded-lg border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10";
const smallButton = "inline-flex h-7 items-center rounded-md px-2 text-xs font-medium disabled:opacity-40";

/** The colour, shown as a round swatch that opens the browser's colour picker. */
function Swatch({ name, value, onChange, label }: { name: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-surface-2" title="Change the colour">
      <span className="size-4 rounded-full ring-1 ring-black/10" style={{ background: value }} aria-hidden />
      <input type="color" name={name} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

/** One button that changes a row: make default, move up or down, or remove (after asking). */
function RowButton({
  org,
  project,
  list,
  id,
  op,
  direction,
  confirm,
  label,
  title,
  className,
  disabled,
  onError,
}: {
  org: string;
  project: string;
  list: List;
  id: string;
  op: "default" | "move" | "remove";
  direction?: "up" | "down";
  confirm?: string;
  label: React.ReactNode;
  title: string;
  className: string;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await workflowRowAction(prev, form);
    onError(result.error ?? null);
    return result;
  }, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {direction && <input type="hidden" name="direction" value={direction} />}
      <button type="submit" disabled={disabled || pending} title={title} aria-label={title} className={className}>
        {label}
      </button>
    </form>
  );
}

const Arrow = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={`size-3.5 ${up ? "rotate-180" : ""}`} aria-hidden>
    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);

/**
 * A status or severity level: reorder, recolour, rename and (statuses) what it means, saved with Save;
 * plus Default and Remove. Rows remount after each save, starting from the stored values.
 */
export function WorkflowRow({
  org,
  project,
  list,
  entry,
  first,
  last,
}: {
  org: string;
  project: string;
  list: List;
  entry: WorkflowEntry;
  first: boolean;
  last: boolean;
}) {
  const [name, setName] = useState(entry.name);
  const [color, setColor] = useState(entry.color);
  const [category, setCategory] = useState(entry.category ?? "");
  const [rowError, setRowError] = useState<string | null>(null);
  const [state, action] = useActionState<ActionState, FormData>(list === "status" ? updateStatusAction : updateSeverityAction, {});
  const dirty = name !== entry.name || color !== entry.color || (list === "status" && category !== entry.category);
  const error = rowError ?? state.error;
  const noun = list === "status" ? "status" : "severity level";
  const reset = () => {
    setName(entry.name);
    setColor(entry.color);
    setCategory(entry.category ?? "");
  };

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex flex-col">
          <RowButton org={org} project={project} list={list} id={entry.id} op="move" direction="up" disabled={first} title={`Move ${entry.name} up`} label={<Arrow up />} className="grid h-4 w-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-25" onError={setRowError} />
          <RowButton org={org} project={project} list={list} id={entry.id} op="move" direction="down" disabled={last} title={`Move ${entry.name} down`} label={<Arrow />} className="grid h-4 w-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-25" onError={setRowError} />
        </div>
        <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="project" value={project} />
          <input type="hidden" name="id" value={entry.id} />
          <Swatch name="color" value={color} onChange={setColor} label={`${entry.name} colour`} />
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && reset()}
            required
            maxLength={50}
            aria-label={`${noun} name`}
            className={`${field} min-w-0 flex-1 font-medium sm:max-w-56`}
          />
          {list === "status" && (
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={`What ${entry.name} means`} className={`${field} text-muted`}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          {dirty && (
            <span className="flex items-center gap-1">
              <SubmitButton pendingText="Saving…" className={`${smallButton} bg-accent text-white hover:bg-neutral-800`}>
                Save
              </SubmitButton>
              <button type="button" onClick={reset} className={`${smallButton} text-muted hover:text-foreground`}>
                Cancel
              </button>
            </span>
          )}
        </form>
        <span className="w-16 text-right text-xs tabular-nums text-muted" title={`${entry.bugCount} ${entry.bugCount === 1 ? "bug" : "bugs"}`}>
          {entry.bugCount} {entry.bugCount === 1 ? "bug" : "bugs"}
        </span>
        <span className="w-24 text-center">
          {entry.isDefault ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium" title={list === "status" ? "New bugs start here" : "New bugs get this level"}>
              Default
            </span>
          ) : (
            <RowButton
              org={org}
              project={project}
              list={list}
              id={entry.id}
              op="default"
              title={list === "status" ? `Start new bugs in ${entry.name}` : `Give new bugs ${entry.name}`}
              label="Make default"
              className={`${smallButton} text-muted hover:bg-surface-2 hover:text-foreground`}
              onError={setRowError}
            />
          )}
        </span>
        <RowButton
          org={org}
          project={project}
          list={list}
          id={entry.id}
          op="remove"
          confirm={`Remove the ${noun} ${entry.name}? Bugs' history keeps its name.`}
          title={`Remove ${entry.name}`}
          label="Remove"
          className={`${smallButton} text-muted hover:bg-red-50 hover:text-red-700`}
          onError={setRowError}
        />
      </div>
      {(error || state.success) && (
        <p className={`mt-1 pl-8 text-xs ${error ? "text-red-700" : "text-muted"}`}>{error ?? state.success}</p>
      )}
    </li>
  );
}

const PALETTE = ["#64748b", "#2563eb", "#9333ea", "#dc2626", "#16a34a", "#ea580c", "#ca8a04", "#0891b2", "#db2777"];

/** The last row of a list: colour, name, (statuses) what it means, Add. `used` are the list's colours. */
export function AddWorkflowEntry({ org, project, list, used }: { org: string; project: string; list: List; used: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(list === "status" ? addStatusAction : addSeverityAction, {});
  // A new entry starts on the first palette colour the list doesn't use yet.
  const fresh = PALETTE.find((c) => !used.includes(c)) ?? PALETTE[used.length % PALETTE.length];
  return <AddFields key={`${state.data?.at ?? "new"}-${fresh}`} org={org} project={project} list={list} action={action} error={state.error} initialColor={fresh} />;
}

function AddFields({
  org,
  project,
  list,
  action,
  error,
  initialColor,
}: {
  org: string;
  project: string;
  list: List;
  action: (form: FormData) => void;
  error?: string;
  initialColor: string;
}) {
  const [color, setColor] = useState(initialColor);
  return (
    <form action={action} className="space-y-2 border-t border-line bg-surface-2/40 px-3 py-3">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <Swatch name="color" value={color} onChange={setColor} label="Colour" />
        <input
          name="name"
          required
          maxLength={50}
          placeholder={list === "status" ? "New status, e.g. Blocked" : "New level, e.g. Trivial"}
          aria-label={list === "status" ? "New status name" : "New severity level name"}
          className={`${addField} min-w-0 flex-1 sm:max-w-56`}
        />
        {list === "status" && (
          <select name="category" defaultValue="in_progress" aria-label="What it means" className={addField}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <SubmitButton pendingText="Adding…" className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {list === "status" ? "Add status" : "Add level"}
        </SubmitButton>
      </div>
      {error && <p className="pl-8 text-xs text-red-700">{error}</p>}
    </form>
  );
}
