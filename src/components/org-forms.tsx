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

export function InviteForm({ org, roles }: { org: string; roles: Role[] }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteMemberAction, {});
  const link = state.data?.link ?? "";
  const { state: copyState, copy } = useCopy(link);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Email" htmlFor="invite-email">
          <input id="invite-email" name="email" type="email" required placeholder="sadia@example.com" className={inputClass} />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <select id="invite-role" name="roleId" defaultValue={roles.find((r) => r.key === "member")?.id} className={selectClass}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton pendingText="Inviting…">Invite</SubmitButton>
      </div>
      <FormMessage error={state.error} />
      {link && (
        <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p>
            Send this link to <span className="font-medium">{state.data?.email}</span>. It works once and expires in 7 days.
          </p>
          <div className="flex gap-2">
            <input readOnly value={link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copy} className="shrink-0 rounded-md bg-accent px-3 text-xs font-medium text-white">
              {copyState === "copied" ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </form>
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
