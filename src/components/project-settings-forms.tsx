"use client";

import { useActionState, useState } from "react";
import {
  createComponentAction,
  createPlatformAction,
  createVersionAction,
  setProjectMemberAction,
  setVersionStatusAction,
  updateProjectAction,
} from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { VERSION_STATUS_COLOR, VERSION_STATUS_LABEL } from "@/lib/labels";
import { Chevron } from "./bug-field-select";
import { Field, FormMessage, inputClass, SubmitButton } from "./form";

/** Slimmer fields for the one-line "add" rows. */
const compactInput =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/10";
const compactButton =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50";

/** A value shown as a pill, changed by picking from the invisible select on top of it. */
function PillSelect({
  name,
  value,
  options,
  label,
  dot,
  pending,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  /** The dot's colour for a value, e.g. the version status colours. */
  dot?: (value: string) => string;
  pending: boolean;
  onChange: (form: HTMLFormElement | null) => void;
}) {
  // Shows the pick straight away; the page refreshes with the saved value afterwards.
  const [current, setCurrent] = useState(value);
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2.5 pr-7 text-xs font-medium transition hover:border-neutral-400 has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-accent/20 ${
        pending ? "opacity-60" : ""
      }`}
    >
      {dot && <span className="size-2 rounded-full" style={{ background: dot(current) }} aria-hidden />}
      {options.find((o) => o.value === current)?.label}
      <Chevron className="absolute right-2" />
      <select
        name={name}
        value={current}
        disabled={pending}
        onChange={(e) => {
          setCurrent(e.target.value);
          onChange(e.currentTarget.form);
        }}
        aria-label={label}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-wait"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}


type Ids = { org: string; project: string };

function Hidden({ org, project, extra = {} }: Ids & { extra?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** Name and description. Archiving has its own card, so this form keeps the project's archived state. */
export function ProjectGeneralForm({ ids, name, description, archived }: { ids: Ids; name: string; description: string; archived: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProjectAction, {});
  return (
    <form action={action} className="space-y-4">
      <Hidden {...ids} extra={archived ? { archived: "on" } : {}} />
      <Field label="Name" htmlFor="p-name">
        <input id="p-name" name="name" required maxLength={200} defaultValue={name} className={inputClass} />
      </Field>
      <Field label="Description" htmlFor="p-description" hint="Optional. Shown on the projects page.">
        <textarea id="p-description" name="description" rows={3} defaultValue={description} placeholder="What this project covers" className={`${inputClass} resize-y`} />
      </Field>
      <FormMessage error={state.error} success={state.success} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

/** Archives the project (hidden from new reports, bugs kept) or brings it back. */
export function ArchiveProjectForm({ ids, name, description, archived }: { ids: Ids; name: string; description: string; archived: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProjectAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !window.confirm(`Archive ${name}? It's hidden from new reports; its bugs stay.`)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <Hidden {...ids} extra={{ name, description, ...(archived ? {} : { archived: "on" }) }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{archived ? "This project is archived" : "Archive this project"}</p>
        <p className="text-xs text-muted">
          {archived
            ? "It's hidden from new reports. Restore it to report bugs to it again."
            : "Hides it from new reports, in the app and the extension. Its bugs and history stay."}
        </p>
        {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`h-9 shrink-0 rounded-lg border px-3.5 text-sm font-medium disabled:opacity-50 ${
          archived ? "border-line hover:border-accent" : "border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50"
        }`}
      >
        {pending ? "Saving…" : archived ? "Restore project" : "Archive project"}
      </button>
    </form>
  );
}

export function AddVersionForm({ ids }: { ids: Ids }) {
  const [state, action] = useActionState<ActionState, FormData>(createVersionAction, {});
  return (
    <form key={state.success} action={action} className="space-y-2">
      <Hidden {...ids} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem_10rem_auto]">
        <input name="name" required maxLength={100} placeholder="Version, e.g. 1.2" aria-label="Version" className={compactInput} />
        <select name="status" defaultValue="planned" aria-label="Status" className={compactInput}>
          {Object.entries(VERSION_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input name="releaseDate" type="date" aria-label="Release date" title="Release date (optional)" className={compactInput} />
        <SubmitButton pendingText="Adding…" className={compactButton}>
          Add version
        </SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

export function VersionStatusSelect({ ids, versionId, status }: { ids: Ids; versionId: string; status: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setVersionStatusAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Hidden {...ids} extra={{ versionId }} />
      <PillSelect
        name="status"
        value={status}
        label="Version status"
        dot={(s) => VERSION_STATUS_COLOR[s]}
        pending={pending}
        options={Object.entries(VERSION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        onChange={(form) => form?.requestSubmit()}
      />
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

/** One line: a name and an Add button (platforms, features). */
function AddNameForm({ ids, action: serverAction, label, placeholder, button }: {
  ids: Ids;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  placeholder: string;
  button: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(serverAction, {});
  return (
    <form key={state.success} action={action} className="space-y-2">
      <Hidden {...ids} />
      <div className="flex gap-2">
        <input name="name" required maxLength={100} placeholder={placeholder} aria-label={label} className={compactInput} />
        <SubmitButton pendingText="Adding…" className={compactButton}>
          {button}
        </SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

export function AddPlatformForm({ ids }: { ids: Ids }) {
  return <AddNameForm ids={ids} action={createPlatformAction} label="Platform name" placeholder="Add a platform, e.g. Vendor website" button="Add platform" />;
}

export function AddComponentForm({ ids }: { ids: Ids }) {
  return <AddNameForm ids={ids} action={createComponentAction} label="Feature name" placeholder="Add a feature, e.g. Checkout" button="Add feature" />;
}

/** A platform or feature as a chip: its name, how many bugs name it, and × to remove it (after asking). */
export function RemovableChip({
  name,
  count,
  confirm,
  action: serverAction,
  fields,
}: {
  name: string;
  count: number;
  confirm: string;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(serverAction, {});
  return (
    <li className={`flex flex-col ${pending ? "opacity-50" : ""}`}>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(confirm)) e.preventDefault();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm"
      >
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <span>{name}</span>
        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums text-muted" title={`${count} ${count === 1 ? "bug" : "bugs"}`}>
          {count}
        </span>
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          className="grid size-6 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </form>
      {state.error && <span className="mt-1 text-xs text-red-700">{state.error}</span>}
    </li>
  );
}

interface Option {
  id: string;
  name: string;
}

export function AddProjectMemberForm({ ids, people, roles }: { ids: Ids; people: Option[]; roles: (Option & { key: string })[] }) {
  const [state, action] = useActionState<ActionState, FormData>(setProjectMemberAction, {});
  if (people.length === 0) {
    return <p className="text-sm text-muted">Everyone in the organization is on this project. Invite more people from Members.</p>;
  }
  return (
    <form key={state.success} action={action} className="space-y-2">
      <Hidden {...ids} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
        <select name="userId" required defaultValue="" aria-label="Person" className={compactInput}>
          <option value="" disabled>
            Add someone from the organization
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="roleId" defaultValue={roles.find((r) => r.key === "developer")?.id} aria-label="Project role" className={compactInput}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="Adding…" className={compactButton}>
          Add to project
        </SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

export function ProjectMemberRoleSelect({ ids, userId, roleId, roles }: { ids: Ids; userId: string; roleId: string; roles: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setProjectMemberAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Hidden {...ids} extra={{ userId }} />
      <PillSelect
        name="roleId"
        value={roleId}
        label="Project role"
        pending={pending}
        options={roles.map((r) => ({ value: r.id, label: r.name }))}
        onChange={(form) => form?.requestSubmit()}
      />
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
