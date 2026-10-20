"use client";

import { useActionState, useState } from "react";
import { reportBugAction } from "@/server/actions/project";
import type { ActionState } from "@/server/actions/result";
import { PRIORITY_LABEL, VERSION_STATUS_LABEL } from "@/lib/labels";
import { Field, FormMessage, inputClass, selectClass, SubmitButton } from "./form";

interface Option {
  id: string;
  name: string;
}

export function ReportBugForm({
  org,
  project,
  versions,
  defaultVersionId,
  platforms,
  defaultPlatformId,
  components,
  severities,
  members,
}: {
  org: string;
  project: string;
  versions: (Option & { status: string })[];
  defaultVersionId: string;
  /** Empty when the project doesn't split into platforms. */
  platforms: Option[];
  defaultPlatformId?: string;
  components: Option[];
  /** The organization's severity levels, most severe first. */
  severities: (Option & { isDefault: boolean })[];
  /** Empty when the reporter can't assign bugs. */
  members: Option[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(reportBugAction, {});
  const [files, setFiles] = useState<File[]>([]);
  const tooBig = files.reduce((n, f) => n + f.size, 0) > 28 * 1024 * 1024;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="project" value={project} />

      <Field label="Title" htmlFor="title">
        <input id="title" name="title" required maxLength={300} autoFocus placeholder="What went wrong?" className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {platforms.length > 0 && (
          <Field label="Platform" htmlFor="platformId" hint="Where you found it, such as Admin panel or User app.">
            <select id="platformId" name="platformId" required defaultValue={defaultPlatformId ?? ""} className={selectClass}>
              <option value="" disabled>
                Choose a platform
              </option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Found in version" htmlFor="versionId">
          <select id="versionId" name="versionId" required defaultValue={defaultVersionId} className={selectClass}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({VERSION_STATUS_LABEL[v.status] ?? v.status})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Feature" htmlFor="componentId" hint="The part of the product the bug is in.">
          <select id="componentId" name="componentId" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Choose a feature
            </option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity" htmlFor="severity" hint="How bad the impact is.">
          <select id="severity" name="severityId" defaultValue={severities.find((s) => s.isDefault)?.id} className={selectClass}>
            {severities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="priority" hint="How soon it should be fixed.">
          <select id="priority" name="priority" defaultValue="medium" className={selectClass}>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {members.length > 0 && (
          <Field label="Assignee" htmlFor="assigneeId">
            <select id="assigneeId" name="assigneeId" defaultValue="" className={selectClass}>
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Description" htmlFor="description">
        <textarea id="description" name="description" rows={3} className={inputClass} />
      </Field>
      <Field label="Steps to reproduce" htmlFor="steps">
        <textarea id="steps" name="steps" rows={4} placeholder={"1. Open checkout\n2. Apply coupon SAVE10"} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Expected result" htmlFor="expected">
          <textarea id="expected" name="expected" rows={3} className={inputClass} />
        </Field>
        <Field label="Actual result" htmlFor="actual">
          <textarea id="actual" name="actual" rows={3} className={inputClass} />
        </Field>
      </div>
      <Field label="Environment" htmlFor="environment" hint="Device, browser, account or data used.">
        <input id="environment" name="environment" maxLength={500} placeholder="Chrome 155 on macOS, staging" className={inputClass} />
      </Field>

      <Field label="Screenshots and recordings" htmlFor="attachments" hint="PNG, JPEG, GIF, WebP, WebM or MP4. Up to 10 files, 25 MB each.">
        <input
          id="attachments"
          name="attachments"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,video/webm,video/mp4"
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </Field>
      {tooBig && <FormMessage error="Together these files are over 28 MB. Remove some, or use the browser extension for long recordings." />}

      <FormMessage error={state.error} />
      <SubmitButton pendingText="Reporting…">Report bug</SubmitButton>
    </form>
  );
}
