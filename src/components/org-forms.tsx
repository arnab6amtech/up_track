"use client";

import { useActionState, useState } from "react";
import {
  changeMemberRoleAction,
  createProjectAction,
  createTokenAction,
  inviteMemberAction,
} from "@/server/actions/org";
import type { ActionState } from "@/server/actions/result";
import { useCopy } from "./agent-command";
import { Field, FormMessage, inputClass, selectClass, SubmitButton } from "./form";

/** "Null Void Studio" → "NVS", "Uptrack" → "UPT". */
function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return /^[A-Z]/.test(key) ? key.slice(0, 10) : "";
}

export function NewProjectForm({ org }: { org: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createProjectAction, {});
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <Field label="Project name" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!keyEdited) setKey(suggestKey(e.target.value));
          }}
          className={inputClass}
        />
      </Field>
      <Field label="Key" htmlFor="key" hint="Prefix for bug numbers, e.g. UPT-42. 2–10 letters or digits.">
        <input
          id="key"
          name="key"
          required
          maxLength={10}
          value={key}
          onChange={(e) => {
            setKeyEdited(true);
            setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
          }}
          className={`${inputClass} font-mono uppercase`}
        />
      </Field>
      <Field label="Description" htmlFor="description">
        <textarea id="description" name="description" rows={3} className={inputClass} />
      </Field>
      <Field label="First version" htmlFor="firstVersion" hint="The version QA is testing now. You can add more later.">
        <input id="firstVersion" name="firstVersion" defaultValue="1.0" maxLength={100} className={inputClass} />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Creating…">Create project</SubmitButton>
    </form>
  );
}

interface Role {
  id: string;
  name: string;
  key: string;
}

const INVITE_CHOICES = [
  { value: "developer", label: "Developer", text: "Fixes bugs and moves them along." },
  { value: "sqa", label: "QA", text: "Reports, verifies and closes bugs." },
  { value: "admin", label: "Admin", text: "Runs every project and the team with you." },
] as const;

interface InviteResult {
  email: string;
  link?: string;
  emailed?: boolean;
  error?: string;
}

type InviteProject = { id: string; key: string; name: string };

/**
 * Invites developers and QA by email: one or more addresses, a role, and the projects they join. Each
 * person is emailed Accept and Decline links; where email isn't set up, the links are shown to copy.
 */
export function InviteForm({ org, projects, canInviteAdmin }: { org: string; projects: InviteProject[]; canInviteAdmin: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteMemberAction, {});
  const results: InviteResult[] = state.data?.results ? JSON.parse(state.data.results) : [];
  return (
    <div className="space-y-4">
      {/* A new key after each send starts the form over: addresses, role and projects. */}
      <InviteFields key={state.data?.sentAt ?? "new"} org={org} projects={projects} canInviteAdmin={canInviteAdmin} action={action} error={state.error} />
      {results.length > 0 && !state.error && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface-2 text-sm">
          {results.map((r) => (
            <InviteResultRow key={r.email} result={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteFields({
  org,
  projects,
  canInviteAdmin,
  action,
  error,
}: {
  org: string;
  projects: InviteProject[];
  canInviteAdmin: boolean;
  action: (form: FormData) => void;
  error?: string;
}) {
  const [role, setRole] = useState<(typeof INVITE_CHOICES)[number]["value"]>("developer");
  const [scope, setScope] = useState<"all" | "some">("all");
  const choices = canInviteAdmin ? INVITE_CHOICES : INVITE_CHOICES.filter((c) => c.value !== "admin");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="role" value={role} />
      <Field label="Email addresses" htmlFor="invite-emails" hint="Separate several with commas or new lines.">
        <textarea id="invite-emails" name="emails" rows={2} required placeholder="sadia@example.com, rafi@example.com" className={`${inputClass} resize-y`} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Role</legend>
        <div className={`grid gap-2 ${choices.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {choices.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/20 ${
                role === c.value ? "border-accent bg-surface-2" : "border-line hover:border-neutral-400"
              }`}
            >
              <input type="radio" name="role-choice" checked={role === c.value} onChange={() => setRole(c.value)} className="mt-0.5 accent-accent" />
              <span>
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs leading-snug text-muted">{c.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {role !== "admin" && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 block text-sm font-medium">Projects</legend>
          {projects.length === 0 ? (
            <p className="text-xs text-muted">There are no projects yet. Add people to projects later in each project&apos;s settings.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="projects" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="accent-accent" />
                  All projects <span className="text-muted">({projects.length})</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="projects" value="some" checked={scope === "some"} onChange={() => setScope("some")} className="accent-accent" />
                  Only some
                </label>
              </div>
              {scope === "some" && (
                <div className="grid gap-1.5 rounded-lg border border-line p-3 sm:grid-cols-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex min-w-0 items-center gap-2 text-sm">
                      <input type="checkbox" name="projectIds" value={p.id} className="accent-accent" />
                      <span className="rounded bg-surface-2 px-1 font-mono text-[11px] font-semibold">{p.key}</span>
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
      )}
      <FormMessage error={error} />
      <SubmitButton pendingText="Sending invitations…">Send invitations</SubmitButton>
    </form>
  );
}

function InviteResultRow({ result: r }: { result: InviteResult }) {
  const { state: copyState, copy } = useCopy(r.link ?? "");
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium">{r.email}</span>
        <span className={`text-xs ${r.error ? "text-red-700" : "text-muted"}`}>
          {r.error ?? (r.emailed ? "Invitation emailed." : "Email isn't set up on this server, so send them this link.")}
        </span>
      </p>
      {r.link && (
        <div className="flex gap-2">
          <input readOnly value={r.link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} aria-label={`Invitation link for ${r.email}`} />
          <button type="button" onClick={copy} className="shrink-0 rounded-md bg-accent px-3 text-xs font-medium text-white">
            {copyState === "copied" ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </li>
  );
}

/** Changes a member's role as soon as a new one is picked. */
export function MemberRoleSelect({ org, userId, roleId, roles }: { org: string; userId: string; roleId: string; roles: Role[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeMemberRoleAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="userId" value={userId} />
      <select
        name="roleId"
        defaultValue={roleId}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
        aria-label="Role"
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

export function CreateTokenForm({ org }: { org: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createTokenAction, {});
  const token = state.data?.token ?? "";
  const { state: copyState, copy } = useCopy(token);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Name" htmlFor="token-name">
          <input id="token-name" name="name" required maxLength={100} placeholder="Laptop extension and agent" className={inputClass} />
        </Field>
        <Field label="Expires" htmlFor="token-expires">
          <select id="token-expires" name="expires" defaultValue="90" className={selectClass}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
            <option value="">Never</option>
          </select>
        </Field>
        <SubmitButton pendingText="Creating…">Create token</SubmitButton>
      </div>
      <FormMessage error={state.error} />
      {token && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Copy “{state.data?.name}” now. You won&apos;t be able to see it again.</p>
          <div className="flex gap-2">
            <input readOnly value={token} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copy} className="shrink-0 rounded-md bg-accent px-3 text-xs font-medium text-white">
              {copyState === "copied" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs">
            Paste it into the browser extension, or set it as <code className="font-mono">UPTRACK_TOKEN</code> for your AI agent.
          </p>
        </div>
      )}
    </form>
  );
}
