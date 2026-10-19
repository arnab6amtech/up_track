import "server-only";
import { isFailed, type CaptureLog } from "../capture-types";
import { PRIORITY_LABEL, RESOLUTION_LABEL, SEVERITY_LABEL } from "../labels";
import { canViewProject } from "@/server/access";
import { findBugByKey, listComments, PRIORITIES, SEVERITIES, type BugDetail } from "@/server/bugs";
import { inOrg } from "@/server/db";
import { listProjects } from "@/server/projects";
import { getObject } from "@/server/storage";
import type { TokenCaller } from "@/server/tokens";
import { clip, describeCall, fail, json, MAX_IMAGE_BYTES, text, type ToolContent, type ToolResult } from "./common";

// Tools over the tracker's bugs, limited to what the token's owner can see.

export const BUG_KEY = /^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/;

async function readObject(key: string, maxBytes: number): Promise<Uint8Array | null> {
  const object = await getObject(key);
  if (!object || object.size > maxBytes) return null;
  return new Uint8Array(await new Response(object.stream).arrayBuffer());
}

/** A bug by key, if it exists and the caller may see its project. */
async function visibleBug(caller: TokenCaller, key: string): Promise<BugDetail | null> {
  const bug = await findBugByKey(caller.orgId, key);
  if (!bug) return null;
  return (await canViewProject(caller.userId, caller.orgId, bug.projectId)) ? bug : null;
}

async function readLog(bug: BugDetail): Promise<CaptureLog | null> {
  const logId = bug.capture?.logAttachmentId;
  const attachment = logId && bug.attachments.find((a) => a.id === logId);
  if (!attachment) return null;
  const keyRow = await inOrg(bug.organizationId, (tx) =>
    tx.query<{ storage_key: string }>("select storage_key from bug_attachments where id = $1", [attachment.id]),
  );
  const bytes = keyRow[0] && (await readObject(keyRow[0].storage_key, 20 * 1024 * 1024));
  return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as CaptureLog) : null;
}

export async function listProjectsTool(caller: TokenCaller): Promise<ToolResult> {
  const projects = await listProjects(caller.orgId, caller.userId, caller.isAdmin);
  const versions = await inOrg(caller.orgId, (tx) =>
    tx.query<{ project_id: string; name: string; status: string }>(
      "select project_id, name, status from project_versions where organization_id = $1 and status <> 'archived' order by sort_order desc",
      [caller.orgId],
    ),
  );
  return json({
    organization: caller.orgName,
    projects: projects.map((p) => ({
      key: p.key,
      name: p.name,
      status: p.status,
      open_bugs: p.openBugs,
      total_bugs: p.totalBugs,
      versions: versions.filter((v) => v.project_id === p.id).map((v) => `${v.name} (${v.status})`),
    })),
  });
}

export interface TrackerSearchArgs {
  project?: string;
  version?: string;
  module?: string;
  status?: string;
  open_only?: boolean;
  assignee?: string;
  severity?: string;
  priority?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export async function searchTracker(caller: TokenCaller, args: TrackerSearchArgs): Promise<ToolResult> {
  const params: unknown[] = [caller.orgId, caller.userId, caller.isAdmin];
  const where = [
    "b.organization_id = $1",
    "b.deleted_at is null",
    "p.deleted_at is null",
    "($3 or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = $2))",
  ];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (args.project) add("p.key = upper(?)", args.project);
  if (args.version) add("v.name ilike ?", args.version);
  if (args.module) add("c.name ilike '%' || ? || '%'", args.module);
  if (args.open_only) where.push("s.category <> 'done'");
  if (args.status) add("s.name ilike ?", args.status);
  if (args.assignee === "me") where.push("b.assignee_id = $2");
  else if (args.assignee === "none") where.push("b.assignee_id is null");
  else if (args.assignee) add("a.full_name ilike '%' || ? || '%'", args.assignee);
  if (args.severity && (SEVERITIES as readonly string[]).includes(args.severity.toLowerCase())) add("b.severity = ?::bug_severity", args.severity.toLowerCase());
  if (args.priority && (PRIORITIES as readonly string[]).includes(args.priority.toLowerCase())) add("b.priority = ?::bug_priority", args.priority.toLowerCase());
  if (args.query?.trim()) add("(b.search_vector @@ plainto_tsquery('simple', ?) or b.title ilike '%' || ? || '%')", args.query.trim());

  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  const whereSql = where.join(" and ");
  const from = `from bugs b
    join projects p on p.id = b.project_id
    join workflow_statuses s on s.id = b.status_id
    join project_versions v on v.id = b.found_in_version_id
    left join project_components c on c.id = b.component_id
    left join users a on a.id = b.assignee_id`;
  return inOrg(caller.orgId, async (tx) => {
    const rows = await tx.query<Record<string, unknown>>(
      `select p.key || '-' || b.number as id, b.title, s.name as status, s.category <> 'done' as open, b.resolution,
              b.severity, b.priority, a.full_name as assignee, v.name as found_in, c.name as module,
              (select count(*)::int from bug_attachments x where x.bug_id = b.id and x.kind in ('image', 'video') and x.deleted_at is null) as references,
              exists (select 1 from bug_captures bc where bc.bug_id = b.id) as has_api_log
         ${from} where ${whereSql}
        order by b.priority, b.updated_at desc limit ${limit} offset ${offset}`,
      params,
    );
    const total = await tx.query<{ n: number }>(`select count(*)::int as n ${from} where ${whereSql}`, params);
    const n = total[0]?.n ?? 0;
    return json({
      total: n,
      offset,
      next_offset: offset + limit < n ? offset + limit : null,
      results: rows.map((r) => ({ ...r, title: clip(String(r.title), 240) })),
    });
  });
}

export async function getTrackerBug(caller: TokenCaller, key: string, baseUrl: string): Promise<ToolResult> {
  const bug = await visibleBug(caller, key);
  if (!bug) return fail(`No bug ${key.toUpperCase()} that you can see. Use search_bugs to find bug keys.`);
  const lines = [`# ${bug.title}`, ""];
  const meta: [string, string | null][] = [
    ["Key", `${bug.projectKey}-${bug.number}`],
    ["Project", bug.projectName],
    ["Status", `${bug.statusName}${bug.resolution ? ` (${RESOLUTION_LABEL[bug.resolution]})` : ""}`],
    ["Still open", bug.statusCategory === "done" ? "no" : "yes"],
    ["Severity", SEVERITY_LABEL[bug.severity]],
    ["Priority", PRIORITY_LABEL[bug.priority]],
    ["Found in version", bug.foundInVersionName],
    ["Fixed in version", bug.fixedInVersionName],
    ["Module", bug.componentName],
    ["Reported by", bug.reporterName],
    ["Assignee", bug.assigneeName ?? "nobody"],
    ["UpTrack page", `${baseUrl}/o/${caller.orgSlug}/p/${bug.projectKey}/bugs/${bug.number}`],
  ];
  for (const [k, v] of meta) if (v) lines.push(`- **${k}:** ${v}`);
  const sections: [string, string | null][] = [
    ["Description", bug.description],
    ["Steps to reproduce", bug.stepsToReproduce],
    ["Expected result", bug.expectedResult],
    ["Actual result", bug.actualResult],
    ["Environment", bug.environment],
  ];
  for (const [title, body] of sections) if (body) lines.push("", `## ${title}`, body);

  const media = bug.attachments.filter((a) => a.kind === "image" || a.kind === "video");
  if (media.length) {
    lines.push("", "## References", "Call get_bug_reference to view the screenshots.");
    media.forEach((a, i) => lines.push(`${i + 1}. ${a.kind === "image" ? "Screenshot" : "Recording"} "${a.fileName}"`));
  }

  if (bug.capture) {
    const c = bug.capture;
    lines.push("", "## Captured page", `- **Page:** ${c.pageUrl}`, `- **Browser:** ${[c.browser, c.os].filter(Boolean).join(" · ")}, window ${c.viewportWidth}×${c.viewportHeight}`);
    const log = await readLog(bug);
    if (log) {
      const failed = log.network.filter(isFailed);
      lines.push("", `## Failed API calls (${failed.length} of ${log.network.length})`);
      if (failed.length === 0) lines.push("None.");
      for (const e of failed.slice(0, 10)) {
        lines.push(`- ${describeCall(e)}`);
        if (e.responseBody) lines.push(`  Response: ${clip(e.responseBody.replace(/\s+/g, " "), 400)}`);
      }
      const errors = log.console.filter((x) => x.level === "error");
      if (errors.length) {
        lines.push("", `## Console errors (${errors.length})`);
        for (const x of errors.slice(0, 10)) lines.push(`- ${clip(x.message.replace(/\s+/g, " "), 300)}`);
      }
      lines.push("", "Call get_bug_logs for every call with headers and bodies.");
    }
  }

  const comments = await listComments(caller.orgId, bug.id);
  if (comments.length) {
    lines.push("", `## Comments (${comments.length})`);
    for (const c of comments.slice(-10)) lines.push(`- **${c.authorName}:** ${clip(c.body.replace(/\s+/g, " "), 500)}`);
  }
  return text(lines.join("\n"));
}

export async function getTrackerReference(caller: TokenCaller, key: string, baseUrl: string, index?: number): Promise<ToolResult> {
  const bug = await visibleBug(caller, key);
  if (!bug) return fail(`No bug ${key.toUpperCase()} that you can see.`);
  const media = bug.attachments.filter((a) => a.kind === "image" || a.kind === "video");
  if (media.length === 0) return text(`${key.toUpperCase()} has no screenshots or recordings.`);
  if (index && index > media.length) return fail(`${key.toUpperCase()} has only ${media.length} reference(s).`);
  const picked = index ? [{ a: media[index - 1], n: index }] : media.slice(0, 5).map((a, i) => ({ a, n: i + 1 }));
  const keys = await inOrg(caller.orgId, (tx) =>
    tx.query<{ id: string; storage_key: string }>("select id, storage_key from bug_attachments where bug_id = $1", [bug.id]),
  );
  const page = `${baseUrl}/o/${caller.orgSlug}/p/${bug.projectKey}/bugs/${bug.number}`;
  const content: ToolContent[] = [];
  for (const { a, n } of picked) {
    const head = `Reference ${n} "${a.fileName}"`;
    if (a.kind === "video") {
      content.push({ type: "text", text: `${head}: a screen recording, which can't be shown here. Watch it at ${page} if the report isn't enough.` });
      continue;
    }
    const storageKey = keys.find((k) => k.id === a.id)?.storage_key;
    const bytes = storageKey ? await readObject(storageKey, MAX_IMAGE_BYTES) : null;
    if (bytes) content.push({ type: "text", text: `${head}:` }, { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: a.contentType });
    else content.push({ type: "text", text: `${head}: too large or missing; view it at ${page}.` });
  }
  return { content };
}

export async function getTrackerLogs(
  caller: TokenCaller,
  key: string,
  opts: { failed_only?: boolean; url_contains?: string; include_bodies?: boolean; limit?: number },
): Promise<ToolResult> {
  const bug = await visibleBug(caller, key);
  if (!bug) return fail(`No bug ${key.toUpperCase()} that you can see.`);
  const log = await readLog(bug);
  if (!log) return fail(`${key.toUpperCase()} wasn't reported with the browser extension, so it has no API log.`);
  const needle = opts.url_contains?.toLowerCase();
  const limit = opts.limit ?? 50;
  const calls = log.network.filter((e) => (!opts.failed_only || isFailed(e)) && (!needle || e.url.toLowerCase().includes(needle)));
  return json({
    total_calls: log.network.length,
    matching_calls: calls.length,
    calls: calls.slice(0, limit).map((e) => (opts.include_bodies === false ? { ...e, requestBody: undefined, responseBody: undefined } : e)),
    console: log.console.slice(0, limit),
  });
}

export async function trackerSummary(caller: TokenCaller, project?: string): Promise<ToolResult> {
  return inOrg(caller.orgId, async (tx) => {
    const rows = await tx.query<{ project: string; status: string; open: boolean; severity: string; assignee: string | null; module: string | null }>(
      `select p.key as project, s.name as status, s.category <> 'done' as open, b.severity, a.full_name as assignee, c.name as module
         from bugs b
         join projects p on p.id = b.project_id and p.deleted_at is null
         join workflow_statuses s on s.id = b.status_id
         left join users a on a.id = b.assignee_id
         left join project_components c on c.id = b.component_id
        where b.organization_id = $1 and b.deleted_at is null
          and ($3 or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = $2))
          and ($4::text is null or p.key = upper($4))`,
      [caller.orgId, caller.userId, caller.isAdmin, project ?? null],
    );
    const open = rows.filter((r) => r.open);
    const tally = (list: typeof rows, pick: (r: (typeof rows)[number]) => string | null) => {
      const counts = new Map<string, number>();
      for (const r of list) counts.set(pick(r) ?? "(none)", (counts.get(pick(r) ?? "(none)") ?? 0) + 1);
      return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
    };
    return json({
      organization: caller.orgName,
      total: rows.length,
      open: open.length,
      open_by_project: tally(open, (r) => r.project),
      open_by_severity: tally(open, (r) => r.severity),
      open_by_assignee: tally(open, (r) => r.assignee),
      open_by_module: tally(open, (r) => r.module),
      by_status: tally(rows, (r) => r.status),
    });
  });
}
