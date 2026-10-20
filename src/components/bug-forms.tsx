"use client";

import { useActionState } from "react";
import { createShareLinkAction, updateBugAction } from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { useCopy } from "./agent-command";
import { FormMessage, inputClass, secondaryButtonClass, SubmitButton } from "./form";

export interface BugText {
  title: string;
  description: string | null;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  environment: string | null;
}

const TEXT_FIELDS: [keyof BugText, string, string, number][] = [
  ["description", "description", "Description", 4],
  ["stepsToReproduce", "steps", "Steps to reproduce", 5],
  ["expectedResult", "expected", "Expected result", 3],
  ["actualResult", "actual", "Actual result", 3],
  ["environment", "environment", "Environment", 1],
];

/** Edit mode for the bug's title and write-up. */
export function BugTextEditor({
  org,
  project,
  bugId,
  lockVersion,
  text,
  onDone,
}: {
  org: string;
  project: string;
  bugId: string;
  lockVersion: number;
  text: BugText;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await updateBugAction(prev, form);
    if (!result.error) onDone();
    return result;
  }, {});
  return (
    <form action={action} className="space-y-4 rounded-xl border border-accent bg-surface p-4">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="bugId" value={bugId} />
      <input type="hidden" name="lockVersion" value={lockVersion} />
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Title</span>
        <input name="title" required maxLength={300} defaultValue={text.title} className={inputClass} />
      </label>
      {TEXT_FIELDS.map(([key, name, label, rows]) => (
        <label key={key} className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
          {rows === 1 ? (
            <input name={name} defaultValue={text[key] ?? ""} className={inputClass} />
          ) : (
            <textarea name={name} rows={rows} defaultValue={text[key] ?? ""} className={inputClass} />
          )}
        </label>
      ))}
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CreateShareLink({ org, project, bugId }: { org: string; project: string; bugId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createShareLinkAction, {});
  const link = state.data?.link ?? "";
  const { state: copyState, copy } = useCopy(link);
  return (
    <div className="space-y-2">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="bugId" value={bugId} />
        <select name="expires" defaultValue="30" aria-label="Link expires" className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs">
          <option value="7">Expires in 7 days</option>
          <option value="30">Expires in 30 days</option>
          <option value="">Never expires</option>
        </select>
        <SubmitButton pendingText="Creating…" className={secondaryButtonClass}>
          Create link
        </SubmitButton>
      </form>
      <FormMessage error={state.error} />
      {link && (
        <div className="space-y-1.5 rounded-lg border border-line bg-surface-2 p-2.5">
          <p className="text-xs">Anyone with this link can view the bug. Copy it now; it isn&apos;t shown again.</p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs" />
            <button type="button" onClick={copy} className="rounded-md bg-accent px-2.5 text-xs font-medium text-white">
              {copyState === "copied" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
