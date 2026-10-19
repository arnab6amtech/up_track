"use client";

import { useActionState } from "react";
import {
  createComponentAction,
  createVersionAction,
  setProjectMemberAction,
  setVersionStatusAction,
  updateProjectAction,
} from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { VERSION_STATUS_LABEL } from "@/lib/labels";
import { Field, FormMessage, inputClass, selectClass, SubmitButton } from "./form";

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

export function ProjectGeneralForm({ ids, name, description, archived }: { ids: Ids; name: string; description: string; archived: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProjectAction, {});
  return (
    <form action={action} className="space-y-4">
      <Hidden {...ids} />
      <Field label="Name" htmlFor="p-name">
        <input id="p-name" name="name" required maxLength={200} defaultValue={name} className={inputClass} />
      </Field>
      <Field label="Description" htmlFor="p-description">
        <textarea id="p-description" name="description" rows={3} defaultValue={description} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="archived" defaultChecked={archived} className="accent-(--accent)" />
        Archived (hidden from new reports; existing bugs stay)
      </label>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

export function AddVersionForm({ ids }: { ids: Ids }) {
  const [state, action] = useActionState<ActionState, FormData>(createVersionAction, {});
  return (
    <form key={state.success} action={action} className="space-y-2">
      <Hidden {...ids} />
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem_10rem_auto] sm:items-end">
        <Field label="Version" htmlFor="v-name">
          <input id="v-name" name="name" required maxLength={100} placeholder="1.2" className={inputClass} />
        </Field>
        <Field label="Status" htmlFor="v-status">
          <select id="v-status" name="status" defaultValue="planned" className={selectClass}>
            {Object.entries(VERSION_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Release date" htmlFor="v-date">
          <input id="v-date" name="releaseDate" type="date" className={inputClass} />
        </Field>
        <SubmitButton pendingText="Adding…">Add version</SubmitButton>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function VersionStatusSelect({ ids, versionId, status }: { ids: Ids; versionId: string; status: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setVersionStatusAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Hidden {...ids} extra={{ versionId }} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Version status"
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
      >
        {Object.entries(VERSION_STATUS_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

export function AddComponentForm({ ids }: { ids: Ids }) {
  const [state, action] = useActionState<ActionState, FormData>(createComponentAction, {});
  return (
    <form key={state.success} action={action} className="space-y-2">
      <Hidden {...ids} />
      <div className="flex gap-2">
        <input name="name" required maxLength={100} placeholder="Checkout" aria-label="Feature name" className={inputClass} />
        <SubmitButton pendingText="Adding…">Add feature</SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
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
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Person" htmlFor="pm-user">
          <select id="pm-user" name="userId" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Pick someone
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project role" htmlFor="pm-role">
          <select id="pm-role" name="roleId" defaultValue={roles.find((r) => r.key === "developer")?.id} className={selectClass}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton pendingText="Adding…">Add to project</SubmitButton>
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
      <select
        name="roleId"
        defaultValue={roleId}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Project role"
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
