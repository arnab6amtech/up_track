import "server-only";
import { randomUUID } from "node:crypto";
import {
  describeUserAgent,
  isFailed,
  PRIORITIES,
  SEVERITIES,
  type CaptureLog,
  type PageInfo,
  type Priority,
  type Severity,
  type VideoMarker,
} from "@/lib/capture-types";
import { newToken, sha256 } from "./auth/crypto";
import { getDb, inOrg, one, type Queryable } from "./db";
import { UserError } from "./orgs";
import { deleteObject, putObject } from "./storage";

export { PRIORITIES, SEVERITIES, type Priority, type Severity };
export const RESOLUTIONS = ["fixed", "wont_fix", "duplicate", "cannot_reproduce", "by_design", "deferred"] as const;

export class ConflictError extends UserError {}

// ---- Workflow ----

export interface WorkflowStatus {
  id: string;
  name: string;
  category: "open" | "in_progress" | "in_review" | "done";
  color: string | null;
  isInitial: boolean;
}

export async function listStatuses(orgId: string): Promise<WorkflowStatus[]> {
  return inOrg(orgId, (tx) =>
    tx.query<WorkflowStatus>(
      `select id, name, category, color, is_initial as "isInitial" from workflow_statuses
        where organization_id = $1 and archived_at is null order by position`,
      [orgId],
    ),
  );
}

// ---- Listing ----

export interface BugFilters {
  q?: string;
  /** A status id, or "open" / "done" for every status in those categories. */
  status?: string;
  version?: string;
  component?: string;
  /** A platform id, or "none" for bugs without one. */
  platform?: string;
  /** A user id, "me" or "none". */
  assignee?: string;
  severity?: string;
  priority?: string;
  sort?: "updated" | "created" | "severity";
  page?: number;
}

export interface BugListItem {
  id: string;
  number: number;
  title: string;
  statusId: string;
  statusName: string;
  statusCategory: string;
  statusColor: string | null;
  severity: Severity;
  priority: Priority;
  resolution: string | null;
  assigneeName: string | null;
  versionName: string;
  componentName: string | null;
  platformId: string | null;
  platformName: string | null;
  /** Screenshots and recordings, oldest first, for the list's reference column. */
  media: ListMedia[];
  hasCapture: boolean;
  /** For saving changes made in the list (the status). */
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ListMedia = Pick<Attachment, "id" | "kind" | "fileName" | "trimStartMs" | "trimEndMs">;

export const BUGS_PAGE_SIZE = 50;

export interface BugList {
  items: BugListItem[];
  total: number;
  /** Bugs matching every filter except the platform, per platform (null: no platform), for the list's tabs. */
  platformCounts: { platformId: string | null; n: number }[];
}

export async function listBugs(orgId: string, projectId: string, userId: string, f: BugFilters): Promise<BugList> {
  const params: unknown[] = [projectId];
  const where = ["b.project_id = $1", "b.deleted_at is null"];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.q?.trim()) {
    const q = f.q.trim();
    // A bug key ("UPT-12" or "12") jumps straight to that number; otherwise full-text plus fuzzy title match.
    const n = q.match(/^(?:[A-Za-z][A-Za-z0-9]*-)?(\d+)$/)?.[1];
    if (n) add("b.number = ?", Number(n));
    else {
      params.push(q);
      const i = params.length;
      where.push(`(b.search_vector @@ plainto_tsquery('simple', $${i}) or b.title ilike '%' || $${i} || '%' or b.title % $${i})`);
    }
  }
  if (f.status === "open") where.push("s.category <> 'done'");
  else if (f.status === "done") where.push("s.category = 'done'");
  else if (f.status) add("b.status_id = ?::uuid", f.status);
  if (f.version) add("b.found_in_version_id = ?::uuid", f.version);
  if (f.component) add("b.component_id = ?::uuid", f.component);
  if (f.assignee === "me") add("b.assignee_id = ?::uuid", userId);
  else if (f.assignee === "none") where.push("b.assignee_id is null");
  else if (f.assignee) add("b.assignee_id = ?::uuid", f.assignee);
  if (f.severity && (SEVERITIES as readonly string[]).includes(f.severity)) add("b.severity = ?::bug_severity", f.severity);
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) add("b.priority = ?::bug_priority", f.priority);
  // The tabs count bugs per platform under all the other filters.
  const tabWhere = where.join(" and ");
  const tabParams = [...params];
  if (f.platform === "none") where.push("b.platform_id is null");
  else if (f.platform) add("b.platform_id = ?::uuid", f.platform);

  const order =
    f.sort === "created" ? "b.number desc" : f.sort === "severity" ? "b.severity, b.updated_at desc" : "b.updated_at desc";
  const page = Math.max(1, f.page ?? 1);
  const whereSql = where.join(" and ");

  return inOrg(orgId, async (tx) => {
    const rows = await tx.query<Omit<BugListItem, "media">>(
      `select b.id, b.number, b.title, b.status_id as "statusId", s.name as "statusName", s.category as "statusCategory", s.color as "statusColor",
              b.severity, b.priority, b.resolution, a.full_name as "assigneeName", v.name as "versionName", c.name as "componentName",
              b.platform_id as "platformId", pl.name as "platformName",
              exists (select 1 from bug_captures bc where bc.bug_id = b.id) as "hasCapture",
              b.lock_version as "lockVersion", b.created_at as "createdAt", b.updated_at as "updatedAt"
         from bugs b
         join workflow_statuses s on s.id = b.status_id
         join project_versions v on v.id = b.found_in_version_id
         left join project_components c on c.id = b.component_id
         left join project_platforms pl on pl.id = b.platform_id
         left join users a on a.id = b.assignee_id
        where ${whereSql}
        order by ${order}
        limit ${BUGS_PAGE_SIZE} offset ${(page - 1) * BUGS_PAGE_SIZE}`,
      params,
    );
    const total = await one<{ n: number }>(
      tx,
      `select count(*)::int as n from bugs b join workflow_statuses s on s.id = b.status_id where ${whereSql}`,
      params,
    );
    const media = rows.length
      ? await tx.query<ListMedia & { bugId: string }>(
          `select bug_id as "bugId", id, kind, file_name as "fileName", trim_start_ms as "trimStartMs", trim_end_ms as "trimEndMs"
             from bug_attachments
            where bug_id = any($1::uuid[]) and deleted_at is null and kind in ('image', 'video')
            order by created_at`,
          [rows.map((r) => r.id)],
        )
      : [];
    const items = rows.map((r) => ({ ...r, media: media.filter((m) => m.bugId === r.id) }));
    const platformCounts = await tx.query<{ platformId: string | null; n: number }>(
      `select b.platform_id as "platformId", count(*)::int as n
         from bugs b join workflow_statuses s on s.id = b.status_id
        where ${tabWhere}
        group by b.platform_id`,
      tabParams,
    );
    return { items, total: total?.n ?? 0, platformCounts };
  });
}

// ---- Detail ----

export interface Attachment {
  id: string;
  kind: "image" | "video" | "log" | "file";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  trimStartMs: number | null;
  trimEndMs: number | null;
  /** Moments the reporter marked in a recording. */
  markers: VideoMarker[] | null;
  createdAt: Date;
}

export interface CaptureInfo {
  pageUrl: string;
  pageTitle: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  devicePixelRatio: string | null;
  language: string | null;
  timezone: string | null;
  logAttachmentId: string | null;
  requestCount: number;
  failedRequestCount: number;
  consoleErrorCount: number;
  capturedAt: Date;
}

export interface BugDetail {
  id: string;
  organizationId: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  number: number;
  title: string;
  description: string | null;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  environment: string | null;
  statusId: string;
  statusName: string;
  statusCategory: WorkflowStatus["category"];
  statusColor: string | null;
  resolution: string | null;
  severity: Severity;
  priority: Priority;
  foundInVersionId: string;
  foundInVersionName: string;
  fixedInVersionId: string | null;
  fixedInVersionName: string | null;
  componentId: string | null;
  componentName: string | null;
  platformId: string | null;
  platformName: string | null;
  reporterId: string;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  source: string;
  lockVersion: number;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  attachments: Attachment[];
  capture: CaptureInfo | null;
}

const DETAIL_SQL = `
  select b.id, b.organization_id as "organizationId", b.project_id as "projectId", p.key as "projectKey", p.name as "projectName",
         b.number, b.title, b.description, b.steps_to_reproduce as "stepsToReproduce", b.expected_result as "expectedResult",
         b.actual_result as "actualResult", b.environment, b.status_id as "statusId", s.name as "statusName",
         s.category as "statusCategory", s.color as "statusColor", b.resolution, b.severity, b.priority,
         b.found_in_version_id as "foundInVersionId", fv.name as "foundInVersionName",
         b.fixed_in_version_id as "fixedInVersionId", xv.name as "fixedInVersionName",
         b.component_id as "componentId", c.name as "componentName",
         b.platform_id as "platformId", pl.name as "platformName",
         b.reporter_id as "reporterId", ru.full_name as "reporterName", b.assignee_id as "assigneeId", au.full_name as "assigneeName",
         b.source, b.lock_version as "lockVersion", b.resolved_at as "resolvedAt", b.created_at as "createdAt", b.updated_at as "updatedAt"
    from bugs b
    join projects p on p.id = b.project_id
    join workflow_statuses s on s.id = b.status_id
    join project_versions fv on fv.id = b.found_in_version_id
    left join project_versions xv on xv.id = b.fixed_in_version_id
    left join project_components c on c.id = b.component_id
    left join project_platforms pl on pl.id = b.platform_id
    join users ru on ru.id = b.reporter_id
    left join users au on au.id = b.assignee_id`;

async function loadExtras(tx: Queryable, bug: Omit<BugDetail, "attachments" | "capture">): Promise<BugDetail> {
  const attachments = await tx.query<Attachment>(
    `select id, kind, file_name as "fileName", content_type as "contentType", size_bytes::int as "sizeBytes", width, height,
            duration_ms as "durationMs", trim_start_ms as "trimStartMs", trim_end_ms as "trimEndMs",
            markers, created_at as "createdAt"
       from bug_attachments where bug_id = $1 and deleted_at is null order by created_at`,
    [bug.id],
  );
  const capture = await one<CaptureInfo>(
    tx,
    `select page_url as "pageUrl", page_title as "pageTitle", user_agent as "userAgent", browser, os,
            viewport_width as "viewportWidth", viewport_height as "viewportHeight", device_pixel_ratio::text as "devicePixelRatio",
            language, timezone, log_attachment_id as "logAttachmentId", request_count as "requestCount",
            failed_request_count as "failedRequestCount", console_error_count as "consoleErrorCount", captured_at as "capturedAt"
       from bug_captures where bug_id = $1`,
    [bug.id],
  );
  return { ...bug, attachments, capture };
}

export async function getBug(orgId: string, projectId: string, number: number): Promise<BugDetail | null> {
  return inOrg(orgId, async (tx) => {
    const bug = await one<Omit<BugDetail, "attachments" | "capture">>(
      tx,
      `${DETAIL_SQL} where b.project_id = $1 and b.number = $2 and b.deleted_at is null`,
      [projectId, number],
    );
    return bug ? loadExtras(tx, bug) : null;
  });
}

async function getBugById(tx: Queryable, bugId: string) {
  const bug = await one<Omit<BugDetail, "attachments" | "capture">>(tx, `${DETAIL_SQL} where b.id = $1 and b.deleted_at is null`, [bugId]);
  return bug ? loadExtras(tx, bug) : null;
}

// ---- Creating ----

export interface NewAttachment {
  kind: Attachment["kind"];
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
  durationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  /** Moments the reporter marked in a recording. */
  markers?: VideoMarker[];
}

export interface NewBug {
  projectId: string;
  reporterId: string;
  title: string;
  description?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  environment?: string;
  foundInVersionId: string;
  componentId?: string | null;
  platformId?: string | null;
  severity?: Severity;
  priority?: Priority;
  assigneeId?: string | null;
  source?: "manual" | "browser_extension" | "import" | "api";
  externalRef?: string | null;
  createdAt?: Date;
  attachments?: NewAttachment[];
  capture?: { page: PageInfo; log: CaptureLog; capturedAt?: Date };
}

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "application/json": ".json",
};

function splitUrl(raw: string): { host: string; path: string } {
  try {
    const u = new URL(raw);
    return { host: u.host, path: u.pathname };
  } catch {
    return { host: "", path: raw.slice(0, 2000) };
  }
}

/** Creates a bug with its files and capture in one transaction. Returns its id and number. */
export async function createBug(orgId: string, input: NewBug): Promise<{ id: string; number: number }> {
  const written: string[] = [];
  try {
    return await inOrg(orgId, async (tx) => {
      const bug = await one<{ id: string; number: number }>(
        tx,
        `insert into bugs (organization_id, project_id, title, description, steps_to_reproduce, expected_result, actual_result,
                           environment, found_in_version_id, component_id, severity, priority, reporter_id, assignee_id, source,
                           external_ref, created_at, updated_at, platform_id)
         values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, ''), $9, $10,
                 $11::bug_severity, $12::bug_priority, $13, $14, $15::bug_source, $16, coalesce($17, now()), coalesce($17, now()), $18)
         returning id, number`,
        [
          orgId,
          input.projectId,
          input.title.trim(),
          input.description?.trim() ?? "",
          input.stepsToReproduce?.trim() ?? "",
          input.expectedResult?.trim() ?? "",
          input.actualResult?.trim() ?? "",
          input.environment?.trim() ?? "",
          input.foundInVersionId,
          input.componentId || null,
          input.severity ?? "medium",
          input.priority ?? "medium",
          input.reporterId,
          input.assigneeId || null,
          input.source ?? "manual",
          input.externalRef ?? null,
          input.createdAt ?? null,
          input.platformId || null,
        ],
      );
      const { id: bugId } = bug!;

      let logAttachmentId: string | null = null;
      const files = [...(input.attachments ?? [])];
      if (input.capture) {
        files.push({
          kind: "log",
          fileName: "log.json",
          contentType: "application/json",
          bytes: new TextEncoder().encode(JSON.stringify(input.capture.log)),
        });
      }
      for (const file of files) {
        const attachmentId = randomUUID();
        const key = `org/${orgId}/bugs/${bugId}/${attachmentId}${EXT[file.contentType] ?? ""}`;
        await putObject(key, file.bytes);
        written.push(key);
        const row = await one<{ id: string }>(
          tx,
          `insert into bug_attachments (organization_id, bug_id, kind, storage_key, file_name, content_type, size_bytes,
                                        width, height, duration_ms, trim_start_ms, trim_end_ms, uploaded_by, markers)
           values ($1, $2, $3::attachment_kind, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) returning id`,
          [orgId, bugId, file.kind, key, file.fileName.slice(0, 255), file.contentType, file.bytes.byteLength,
           file.width ?? null, file.height ?? null, file.durationMs != null ? Math.round(file.durationMs) : null,
           file.trimStartMs ?? null, file.trimEndMs ?? null, input.reporterId,
           file.markers?.length ? JSON.stringify(file.markers) : null],
        );
        if (file.kind === "log") logAttachmentId = row!.id;
      }

      if (input.capture) {
        const { page, log } = input.capture;
        const [browser, os] = describeUserAgent(page.userAgent).split(" · ");
        const failed = log.network.filter(isFailed);
        await tx.query(
          `insert into bug_captures (bug_id, organization_id, page_url, page_title, user_agent, browser, os, viewport_width,
                                     viewport_height, device_pixel_ratio, language, timezone, log_attachment_id, request_count,
                                     failed_request_count, console_error_count, captured_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [bugId, orgId, page.url, page.title || null, page.userAgent, browser, os, page.viewport.width, page.viewport.height,
           page.devicePixelRatio, page.language, page.timezone, logAttachmentId, log.network.length, failed.length,
           log.console.filter((c) => c.level === "error").length, input.capture.capturedAt ?? new Date()],
        );
        for (const e of failed.slice(0, 200)) {
          const { host, path } = splitUrl(e.url);
          await tx.query(
            `insert into bug_network_failures (organization_id, bug_id, method, host, path, status_code, duration_ms, started_at, error, response_excerpt)
             values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0), $9, $10)`,
            [orgId, bugId, e.method.slice(0, 20), host, path, e.status, Math.round(e.durationMs), e.startedAt, e.error ?? null,
             e.responseBody?.slice(0, 2000) ?? null],
          );
        }
      }

      await tx.query(
        "insert into bug_activity (organization_id, bug_id, actor_id, action, created_at) values ($1, $2, $3, 'created', coalesce($4, now()))",
        [orgId, bugId, input.reporterId, input.createdAt ?? null],
      );
      return bug!;
    });
  } catch (err) {
    await Promise.all(written.map((key) => deleteObject(key).catch(() => {})));
    throw err;
  }
}

// ---- Updating ----

export interface BugChanges {
  title?: string;
  description?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  environment?: string | null;
  statusId?: string;
  resolution?: string | null;
  severity?: Severity;
  priority?: Priority;
  assigneeId?: string | null;
  fixedInVersionId?: string | null;
  componentId?: string | null;
  platformId?: string | null;
}

const COLUMNS: Record<keyof BugChanges, { column: string; cast?: string; label: string }> = {
  title: { column: "title", label: "title" },
  description: { column: "description", label: "description" },
  stepsToReproduce: { column: "steps_to_reproduce", label: "steps" },
  expectedResult: { column: "expected_result", label: "expected result" },
  actualResult: { column: "actual_result", label: "actual result" },
  environment: { column: "environment", label: "environment" },
  statusId: { column: "status_id", cast: "uuid", label: "status" },
  resolution: { column: "resolution", cast: "bug_resolution", label: "resolution" },
  severity: { column: "severity", cast: "bug_severity", label: "severity" },
  priority: { column: "priority", cast: "bug_priority", label: "priority" },
  assigneeId: { column: "assignee_id", cast: "uuid", label: "assignee" },
  fixedInVersionId: { column: "fixed_in_version_id", cast: "uuid", label: "fixed in" },
  componentId: { column: "component_id", cast: "uuid", label: "feature" },
  platformId: { column: "platform_id", cast: "uuid", label: "platform" },
};

/**
 * Applies changes if nobody else edited the bug since `lockVersion` was read, and records each
 * changed field in the bug's history (with readable names for statuses, people and versions).
 */
export async function updateBug(orgId: string, bugId: string, actorId: string, lockVersion: number, changes: BugChanges): Promise<void> {
  await inOrg(orgId, async (tx) => {
    const before = await getBugById(tx, bugId);
    if (!before) throw new UserError("That bug no longer exists.");
    if (before.lockVersion !== lockVersion) {
      throw new ConflictError("Someone else changed this bug while you were editing. Reload to see their changes.");
    }
    const current: Record<keyof BugChanges, unknown> = {
      title: before.title,
      description: before.description,
      stepsToReproduce: before.stepsToReproduce,
      expectedResult: before.expectedResult,
      actualResult: before.actualResult,
      environment: before.environment,
      statusId: before.statusId,
      resolution: before.resolution,
      severity: before.severity,
      priority: before.priority,
      assigneeId: before.assigneeId,
      fixedInVersionId: before.fixedInVersionId,
      componentId: before.componentId,
      platformId: before.platformId,
    };
    const changed = (Object.keys(changes) as (keyof BugChanges)[]).filter(
      (k) => changes[k] !== undefined && (changes[k] || null) !== (current[k] || null),
    );
    if (changed.length === 0) return;

    const sets = changed.map((k, i) => `${COLUMNS[k].column} = $${i + 3}${COLUMNS[k].cast ? `::${COLUMNS[k].cast}` : ""}`);
    const values = changed.map((k) => (typeof changes[k] === "string" ? (changes[k] as string).trim() || null : changes[k]));
    const updated = await tx.query(
      `update bugs set ${sets.join(", ")} where id = $1 and lock_version = $2 returning id`,
      [bugId, lockVersion, ...values],
    );
    if (updated.length === 0) throw new ConflictError("Someone else changed this bug while you were editing. Reload to see their changes.");

    const after = (await getBugById(tx, bugId))!;
    const readable: Partial<Record<keyof BugChanges, [unknown, unknown]>> = {
      statusId: [before.statusName, after.statusName],
      assigneeId: [before.assigneeName, after.assigneeName],
      fixedInVersionId: [before.fixedInVersionName, after.fixedInVersionName],
      componentId: [before.componentName, after.componentName],
      platformId: [before.platformName, after.platformName],
    };
    // The status trigger may clear the resolution on reopen; record what actually happened.
    if (before.resolution !== after.resolution && !changed.includes("resolution")) changed.push("resolution");
    for (const k of changed) {
      const [oldValue, newValue] = readable[k] ?? [current[k], (after as unknown as Record<string, unknown>)[k]];
      const action = k === "statusId" ? "status_changed" : k === "assigneeId" ? "assigned" : "updated";
      await tx.query(
        `insert into bug_activity (organization_id, bug_id, actor_id, action, field, old_value, new_value)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [orgId, bugId, actorId, action, COLUMNS[k].label, JSON.stringify(oldValue ?? null), JSON.stringify(newValue ?? null)],
      );
    }
  });
}

// ---- Comments and history ----

export interface Comment {
  id: string;
  /** The comment this one replies to; null for the start of a thread. */
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}

export async function listComments(orgId: string, bugId: string): Promise<Comment[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Comment>(
      `select c.id, c.parent_id as "parentId", c.author_id as "authorId", u.full_name as "authorName", c.body,
              c.created_at as "createdAt", c.edited_at as "editedAt"
         from bug_comments c join users u on u.id = c.author_id
        where c.bug_id = $1 and c.deleted_at is null order by c.created_at`,
      [bugId],
    ),
  );
}

/** Adds a comment, or a reply when parentId is given (a reply to a reply joins the same thread). */
export async function addComment(orgId: string, bugId: string, authorId: string, body: string, parentId?: string | null) {
  await inOrg(orgId, async (tx) => {
    let threadId: string | null = null;
    if (parentId) {
      const parent = await one<{ id: string; parent_id: string | null }>(
        tx,
        "select id, parent_id from bug_comments where id = $1 and bug_id = $2 and deleted_at is null",
        [parentId, bugId],
      );
      if (!parent) throw new UserError("That comment was deleted, so it can't be replied to.");
      threadId = parent.parent_id ?? parent.id;
    }
    await tx.query("insert into bug_comments (organization_id, bug_id, author_id, body, parent_id) values ($1, $2, $3, $4, $5)", [
      orgId,
      bugId,
      authorId,
      body.trim(),
      threadId,
    ]);
    await tx.query("insert into bug_activity (organization_id, bug_id, actor_id, action) values ($1, $2, $3, 'commented')", [orgId, bugId, authorId]);
    await tx.query("update bugs set updated_at = now() where id = $1", [bugId]);
  });
}

/** Changes a comment's text; only its author can. */
export async function editComment(orgId: string, bugId: string, commentId: string, authorId: string, body: string) {
  const rows = await inOrg(orgId, (tx) =>
    tx.query(
      `update bug_comments set body = $5, edited_at = now()
        where organization_id = $1 and bug_id = $2 and id = $3 and author_id = $4 and deleted_at is null returning id`,
      [orgId, bugId, commentId, authorId, body.trim()],
    ),
  );
  if (rows.length === 0) throw new UserError("You can only edit your own comments.");
}

/** Deletes a comment, and its replies when it starts a thread. Its author can, or anyone allowed to moderate. */
export async function deleteComment(orgId: string, bugId: string, commentId: string, userId: string, canModerate: boolean) {
  const rows = await inOrg(orgId, (tx) =>
    tx.query(
      `update bug_comments set deleted_at = now()
        where organization_id = $1 and bug_id = $2 and deleted_at is null
          and (id = $3 or parent_id = $3)
          and ($5 or exists (select 1 from bug_comments own where own.id = $3 and own.author_id = $4))
        returning id`,
      [orgId, bugId, commentId, userId, canModerate],
    ),
  );
  if (rows.length === 0) throw new UserError("You can only delete your own comments.");
}

export interface ActivityItem {
  id: number;
  actorName: string | null;
  action: string;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date;
}

export async function listActivity(orgId: string, bugId: string): Promise<ActivityItem[]> {
  return inOrg(orgId, (tx) =>
    tx.query<ActivityItem>(
      // Features were called modules before; older history rows say so.
      `select a.id::int, u.full_name as "actorName", a.action,
              case a.field when 'module' then 'feature' else a.field end as field, a.old_value as "oldValue", a.new_value as "newValue",
              a.created_at as "createdAt"
         from bug_activity a left join users u on u.id = a.actor_id
        where a.bug_id = $1 order by a.created_at desc, a.id desc limit 100`,
      [bugId],
    ),
  );
}

// ---- Share links ----

export interface ShareLink {
  id: string;
  createdAt: Date;
  expiresAt: Date | null;
  viewCount: number;
}

export async function listShareLinks(orgId: string, bugId: string): Promise<ShareLink[]> {
  return inOrg(orgId, (tx) =>
    tx.query<ShareLink>(
      `select id, created_at as "createdAt", expires_at as "expiresAt", view_count as "viewCount"
         from bug_share_links where bug_id = $1 and revoked_at is null and (expires_at is null or expires_at > now())
        order by created_at desc`,
      [bugId],
    ),
  );
}

/** Creates a public link and returns its secret token; only a hash is stored. */
export async function createShareLink(orgId: string, bugId: string, userId: string, expiresInDays: number | null, token = newToken("shr")): Promise<string> {
  await inOrg(orgId, (tx) =>
    tx.query(
      `insert into bug_share_links (organization_id, bug_id, token_hash, created_by, expires_at)
       values ($1, $2, $3, $4, case when $5::int is null then null else now() + make_interval(days => $5::int) end)`,
      [orgId, bugId, sha256(token), userId, expiresInDays],
    ),
  );
  return token;
}

export async function revokeShareLink(orgId: string, bugId: string, linkId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update bug_share_links set revoked_at = now() where organization_id = $1 and bug_id = $2 and id = $3", [orgId, bugId, linkId]),
  );
}

/** The bug behind a valid share token (and counts the view), or null. */
export async function openSharedBug(token: string, countView = true): Promise<BugDetail | null> {
  const db = await getDb();
  const link = await one<{ id: string; organization_id: string; bug_id: string }>(
    db,
    `select id, organization_id, bug_id from bug_share_links
      where token_hash = $1 and revoked_at is null and (expires_at is null or expires_at > now())`,
    [sha256(token)],
  );
  if (!link) return null;
  return inOrg(link.organization_id, async (tx) => {
    if (countView) {
      await tx.query("update bug_share_links set view_count = view_count + 1, last_viewed_at = now() where id = $1", [link.id]);
    }
    return getBugById(tx, link.bug_id);
  });
}

// ---- Attachments ----

export interface StoredAttachment {
  id: string;
  organizationId: string;
  projectId: string;
  bugId: string;
  storageKey: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}

export async function getAttachment(attachmentId: string): Promise<StoredAttachment | null> {
  const db = await getDb();
  return one<StoredAttachment>(
    db,
    `select a.id, a.organization_id as "organizationId", b.project_id as "projectId", a.bug_id as "bugId",
            a.storage_key as "storageKey", a.content_type as "contentType", a.file_name as "fileName", a.size_bytes::int as "sizeBytes"
       from bug_attachments a join bugs b on b.id = a.bug_id
      where a.id = $1 and a.deleted_at is null and b.deleted_at is null`,
    [attachmentId],
  );
}

export async function isValidShareForBug(token: string, bugId: string): Promise<boolean> {
  const db = await getDb();
  return !!(await one(
    db,
    "select 1 from bug_share_links where token_hash = $1 and bug_id = $2 and revoked_at is null and (expires_at is null or expires_at > now())",
    [sha256(token), bugId],
  ));
}

/** Finds a bug by its key ("UPT-12") within an organization. */
export async function findBugByKey(orgId: string, key: string): Promise<BugDetail | null> {
  const m = key.trim().match(/^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/);
  if (!m) return null;
  return inOrg(orgId, async (tx) => {
    const bug = await one<Omit<BugDetail, "attachments" | "capture">>(
      tx,
      `${DETAIL_SQL} where p.organization_id = $1 and p.key = $2 and b.number = $3 and b.deleted_at is null`,
      [orgId, m[1].toUpperCase(), Number(m[2])],
    );
    return bug ? loadExtras(tx, bug) : null;
  });
}

export interface MyBug {
  projectKey: string;
  projectName: string;
  number: number;
  title: string;
  statusName: string;
  statusColor: string | null;
  priority: Priority;
  severity: Severity;
  updatedAt: Date;
}

/** Open bugs assigned to someone, across the organization's projects. */
export async function listAssignedOpenBugs(orgId: string, userId: string, limit = 10): Promise<MyBug[]> {
  return inOrg(orgId, (tx) =>
    tx.query<MyBug>(
      `select p.key as "projectKey", p.name as "projectName", b.number, b.title, s.name as "statusName", s.color as "statusColor",
              b.priority, b.severity, b.updated_at as "updatedAt"
         from bugs b
         join projects p on p.id = b.project_id and p.deleted_at is null
         join workflow_statuses s on s.id = b.status_id
        where b.organization_id = $1 and b.assignee_id = $2 and b.deleted_at is null and s.category <> 'done'
        order by b.priority, b.updated_at desc
        limit $3`,
      [orgId, userId, limit],
    ),
  );
}
