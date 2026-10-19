"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { publicOrigin } from "@/lib/origin";
import { assertCan, getOrgContext, getProjectAccess } from "../access";
import {
  addComment,
  createBug,
  createShareLink,
  listStatuses,
  PRIORITIES,
  RESOLUTIONS,
  revokeShareLink,
  SEVERITIES,
  updateBug,
  type BugChanges,
  type NewAttachment,
  type Priority,
  type Severity,
} from "../bugs";
import { getDb, one } from "../db";
import { UserError } from "../orgs";
import {
  archiveComponent,
  createComponent,
  createVersion,
  removeProjectMember,
  setProjectMember,
  setVersionStatus,
  updateProject,
  VERSION_STATUSES,
} from "../projects";
import { attempt, text, type ActionState } from "./result";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Accepted uploads, recognised by their first bytes rather than the browser's claimed type. */
function sniff(bytes: Uint8Array): { kind: "image" | "video"; contentType: string } | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { kind: "image", contentType: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) return { kind: "image", contentType: "image/jpeg" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { kind: "image", contentType: "image/gif" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    return { kind: "image", contentType: "image/webp" };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", contentType: "video/webm" };
  if (String.fromCharCode(...b.slice(4, 8)) === "ftyp") return { kind: "video", contentType: "video/mp4" };
  return null;
}

async function readUploads(form: FormData): Promise<NewAttachment[]> {
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw new UserError(`Attach at most ${MAX_FILES} files.`);
  const out: NewAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new UserError(`${file.name} is larger than 25 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes);
    if (!type) throw new UserError(`${file.name} isn't a supported image or video (PNG, JPEG, GIF, WebP, WebM, MP4).`);
    out.push({ ...type, fileName: file.name, bytes });
  }
  return out;
}

const oneOf = <T extends string>(values: readonly T[], value: string): T | undefined =>
  (values as readonly string[]).includes(value) ? (value as T) : undefined;

export async function reportBugAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const org = text(form, "org");
    const access = await getProjectAccess(org, text(form, "project"));
    assertCan(access.permissions, "bug.create");
    const title = text(form, "title");
    const versionId = text(form, "versionId");
    if (!title) throw new UserError("Give the bug a title.");
    if (!versionId) throw new UserError("Pick the version you found it in.");
    const assigneeId = text(form, "assigneeId");
    if (assigneeId) assertCan(access.permissions, "bug.assign");

    const ctx = await getOrgContext(org);
    const bug = await createBug(ctx.org.id, {
      projectId: access.project.id,
      reporterId: ctx.user.id,
      title,
      description: text(form, "description"),
      stepsToReproduce: text(form, "steps"),
      expectedResult: text(form, "expected"),
      actualResult: text(form, "actual"),
      environment: text(form, "environment"),
      foundInVersionId: versionId,
      componentId: text(form, "componentId") || null,
      severity: oneOf(SEVERITIES, text(form, "severity")) ?? "medium",
      priority: oneOf(PRIORITIES, text(form, "priority")) ?? "medium",
      assigneeId: assigneeId || null,
      attachments: await readUploads(form),
    });
    redirect(`/o/${org}/p/${access.project.key}/bugs/${bug.number}`);
  });
}

export async function updateBugAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const org = text(form, "org");
    const ctx = await getOrgContext(org);
    const access = await getProjectAccess(org, text(form, "project"));
    const p = access.permissions;
    const bugId = text(form, "bugId");
    const db = await getDb();
    const current = await one<{ status_id: string; assignee_id: string | null; project_id: string }>(
      db,
      "select status_id, assignee_id, project_id from bugs where id = $1 and organization_id = $2",
      [bugId, ctx.org.id],
    );
    if (!current || current.project_id !== access.project.id) throw new UserError("That bug no longer exists.");

    const changes: BugChanges = {};
    const statusId = text(form, "statusId");
    if (statusId && statusId !== current.status_id) {
      assertCan(p, "bug.change_status");
      const target = (await listStatuses(ctx.org.id)).find((s) => s.id === statusId);
      if (!target) throw new UserError("Pick a status.");
      // Closing a bug is the tester's call: it needs the verify permission (SQA engineers and managers).
      if (target.category === "done") assertCan(p, "bug.verify");
      changes.statusId = statusId;
    }
    if (form.has("resolution")) changes.resolution = oneOf(RESOLUTIONS, text(form, "resolution")) ?? null;

    if (form.has("assigneeId")) {
      const assigneeId = text(form, "assigneeId") || null;
      if (assigneeId !== current.assignee_id) {
        // Anyone working the bug may take it; handing it to someone else needs the assign permission.
        if (assigneeId === ctx.user.id) assertCan(p, "bug.change_status");
        else assertCan(p, "bug.assign");
        changes.assigneeId = assigneeId;
      }
    }

    const editable: [keyof BugChanges, string][] = [
      ["severity", "severity"],
      ["priority", "priority"],
      ["fixedInVersionId", "fixedInVersionId"],
      ["componentId", "componentId"],
      ["title", "title"],
      ["description", "description"],
      ["stepsToReproduce", "steps"],
      ["expectedResult", "expected"],
      ["actualResult", "actual"],
      ["environment", "environment"],
    ];
    for (const [key, field] of editable) {
      if (!form.has(field)) continue;
      const value = text(form, field);
      if (key === "severity") changes.severity = oneOf(SEVERITIES, value) as Severity | undefined;
      else if (key === "priority") changes.priority = oneOf(PRIORITIES, value) as Priority | undefined;
      else if (key === "title") changes.title = value || undefined;
      else (changes as Record<string, string | null>)[key] = value || null;
    }
    const edits = editable.map(([k]) => k).filter((k) => changes[k] !== undefined);
    if (edits.length) assertCan(p, "bug.edit");

    await updateBug(ctx.org.id, bugId, ctx.user.id, Number(text(form, "lockVersion")), changes);
    refresh();
    return { success: "Saved." };
  });
}

export async function addCommentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const org = text(form, "org");
    const ctx = await getOrgContext(org);
    const access = await getProjectAccess(org, text(form, "project"));
    assertCan(access.permissions, "bug.comment");
    const body = text(form, "body");
    if (!body) throw new UserError("Write something first.");
    await addComment(ctx.org.id, text(form, "bugId"), ctx.user.id, body);
    refresh();
    // A fresh value each time lets the form reset itself after posting.
    return { success: "posted", data: { postedAt: String(Date.now()) } };
  });
}

export async function createShareLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const org = text(form, "org");
    const ctx = await getOrgContext(org);
    const access = await getProjectAccess(org, text(form, "project"));
    assertCan(access.permissions, "bug.share");
    const days = text(form, "expires");
    const token = await createShareLink(ctx.org.id, text(form, "bugId"), ctx.user.id, days ? Number(days) : null);
    refresh();
    return { data: { link: `${await publicOrigin()}/s/${token}` } };
  });
}

export async function revokeShareLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const org = text(form, "org");
    const ctx = await getOrgContext(org);
    const access = await getProjectAccess(org, text(form, "project"));
    assertCan(access.permissions, "bug.share");
    await revokeShareLink(ctx.org.id, text(form, "bugId"), text(form, "linkId"));
    refresh();
  });
}

// ---- Project settings ----

async function managed(form: FormData, permission: string) {
  const org = text(form, "org");
  const ctx = await getOrgContext(org);
  const access = await getProjectAccess(org, text(form, "project"));
  assertCan(access.permissions, permission);
  return { ctx, access };
}

export async function updateProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage");
    if (!text(form, "name")) throw new UserError("The project needs a name.");
    await updateProject(ctx.org.id, access.project.id, {
      name: text(form, "name"),
      description: text(form, "description"),
      archived: form.get("archived") === "on",
    });
    refresh();
    return { success: "Project saved." };
  });
}

export async function createVersionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage_versions");
    const name = text(form, "name");
    if (!name) throw new UserError("Name the version, e.g. 1.2.");
    const status = oneOf(VERSION_STATUSES, text(form, "status")) ?? "planned";
    await createVersion(ctx.org.id, access.project.id, ctx.user.id, name, status, text(form, "releaseDate") || null);
    refresh();
    return { success: `Version ${name} added.` };
  });
}

export async function setVersionStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage_versions");
    const status = oneOf(VERSION_STATUSES, text(form, "status"));
    if (!status) throw new UserError("Pick a status.");
    await setVersionStatus(ctx.org.id, access.project.id, text(form, "versionId"), status);
    refresh();
  });
}

export async function createComponentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage");
    const name = text(form, "name");
    if (!name) throw new UserError("Name the module, e.g. Checkout.");
    await createComponent(ctx.org.id, access.project.id, name);
    refresh();
    return { success: `Module ${name} added.` };
  });
}

export async function archiveComponentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage");
    await archiveComponent(ctx.org.id, access.project.id, text(form, "componentId"));
    refresh();
  });
}

export async function setProjectMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage");
    const userId = text(form, "userId");
    if (!userId) throw new UserError("Pick a person.");
    await setProjectMember(ctx.org.id, access.project.id, userId, text(form, "roleId"), ctx.user.id);
    refresh();
    return { success: "Saved." };
  });
}

export async function removeProjectMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { ctx, access } = await managed(form, "project.manage");
    await removeProjectMember(ctx.org.id, access.project.id, text(form, "userId"));
    refresh();
  });
}
