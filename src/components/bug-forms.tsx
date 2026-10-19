"use client";

import { useActionState, useState } from "react";
import { addCommentAction, createShareLinkAction, updateBugAction } from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { PRIORITY_LABEL, RESOLUTION_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { useCopy } from "./agent-command";
import { FormMessage, inputClass, secondaryButtonClass, SubmitButton } from "./form";

interface Option {
  id: string;
  name: string;
}

export interface BugPanelProps {
  org: string;
  project: string;
  bugId: string;
  lockVersion: number;
  currentUserId: string;
  statuses: (Option & { category: string })[];
  versions: Option[];
  components: Option[];
  members: Option[];
  bug: {
    statusId: string;
    resolution: string | null;
    assigneeId: string | null;
    severity: string;
    priority: string;
    fixedInVersionId: string | null;
    componentId: string | null;
  };
  can: { changeStatus: boolean; verify: boolean; assign: boolean; edit: boolean };
}

const small = "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-surface-2 disabled:text-muted";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

/** The status / assignee / classification panel. Fields people can't change are shown read-only. */
export function BugPanel(props: BugPanelProps) {
  const { bug, can } = props;
  const [state, action] = useActionState<ActionState, FormData>(updateBugAction, {});
  const [statusId, setStatusId] = useState(bug.statusId);
  const selected = props.statuses.find((s) => s.id === statusId);
  const isDone = selected?.category === "done";
  const canSave = can.changeStatus || can.assign || can.edit;
  // Without the assign permission, the only choices are keeping the current assignee or taking the bug.
  const assigneeOptions = can.assign
    ? props.members
    : props.members.filter((m) => m.id === bug.assigneeId || m.id === props.currentUserId);

  return (
    // Remount after each save so the form shows the stored values and the new lock version.
    <form key={props.lockVersion} action={action} className="space-y-3">
      <input type="hidden" name="org" value={props.org} />
      <input type="hidden" name="project" value={props.project} />
      <input type="hidden" name="bugId" value={props.bugId} />
      <input type="hidden" name="lockVersion" value={props.lockVersion} />

      <Row label="Status">
        <select name="statusId" value={statusId} onChange={(e) => setStatusId(e.target.value)} disabled={!can.changeStatus} className={small}>
          {props.statuses.map((s) => (
            <option key={s.id} value={s.id} disabled={s.category === "done" && !can.verify && s.id !== bug.statusId}>
              {s.name}
              {s.category === "done" && !can.verify ? " (SQA closes)" : ""}
            </option>
          ))}
        </select>
      </Row>
      {isDone && (
        <Row label="Resolution">
          <select name="resolution" defaultValue={bug.resolution ?? "fixed"} disabled={!can.changeStatus} className={small}>
            {Object.entries(RESOLUTION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row label="Assignee">
        <select name="assigneeId" defaultValue={bug.assigneeId ?? ""} disabled={!can.assign && !can.changeStatus} className={small}>
          <option value="">Nobody</option>
          {assigneeOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === props.currentUserId ? `${m.name} (me)` : m.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Severity">
        <select name="severity" defaultValue={bug.severity} disabled={!can.edit} className={small}>
          {Object.entries(SEVERITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Priority">
        <select name="priority" defaultValue={bug.priority} disabled={!can.edit} className={small}>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Fixed in">
        <select name="fixedInVersionId" defaultValue={bug.fixedInVersionId ?? ""} disabled={!can.edit} className={small}>
          <option value="">Not yet</option>
          {props.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Feature">
        <select name="componentId" defaultValue={bug.componentId ?? ""} disabled={!can.edit} className={small}>
          {/* Only older bugs can be without a feature; once set, it can be changed but not cleared. */}
          {!bug.componentId && <option value="">None</option>}
          {props.components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Row>

      <FormMessage error={state.error} success={state.success} />
      {canSave && (
        <SubmitButton pendingText="Saving…" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          Save changes
        </SubmitButton>
      )}
    </form>
  );
}

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

export function CommentForm({ org, project, bugId }: { org: string; project: string; bugId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addCommentAction, {});
  return (
    // A new key after each post clears the textarea.
    <form key={state.data?.postedAt ?? "draft"} action={action} className="space-y-2">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="bugId" value={bugId} />
      <textarea name="body" rows={3} required maxLength={20000} placeholder="Add a comment" className={inputClass} />
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Posting…" className={secondaryButtonClass}>
        Comment
      </SubmitButton>
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
