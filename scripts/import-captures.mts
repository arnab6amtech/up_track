// Imports bug reports saved by the browser extension before UpTrack had a database
// (data/workbooks/captures) into a project version. Safe to run again: imported captures are skipped.
//
// Usage:
//   npm run db:import-captures -- --org null-void-studio --project UPT --version 1.0 [--reporter you@example.com] [--dir path]
//
// With the embedded database, stop the UpTrack server first (it holds the database open).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { CaptureLog, PageInfo } from "@/lib/capture-types";
import { createBug, createShareLink, type Priority } from "@/server/bugs";
import { getDb, one } from "@/server/db";
import { createComponent } from "@/server/projects";
import { listSeverities } from "@/server/workflow";

interface OldCapture {
  id: string;
  number: number;
  createdAt: string;
  reporter: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  module: string;
  media: { kind: "image" | "video"; file: string; mime: string; width?: number; height?: number; durationMs?: number; trimStartMs?: number; trimEndMs?: number }[];
  page: PageInfo;
}

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    project: { type: "string" },
    version: { type: "string" },
    reporter: { type: "string" },
    dir: { type: "string", default: path.join(process.env.WORKBOOKS_DIR?.trim() || "data/workbooks", "captures") },
  },
});

function exit(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!values.org || !values.project || !values.version) {
  exit("Usage: npm run db:import-captures -- --org <slug> --project <KEY> --version <name> [--reporter <email>] [--dir <path>]");
}

const dir = path.resolve(values.dir!);
const captures = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8").catch(() => exit(`No captures found in ${dir}.`))) as OldCapture[];
const db = await getDb().catch((err: Error) => exit(err.message));

const org = await one<{ id: string }>(db, "select id from organizations where slug = $1 and deleted_at is null", [values.org]);
if (!org) exit(`No organization "${values.org}".`);
const project = await one<{ id: string; key: string }>(db, "select id, key from projects where organization_id = $1 and key = upper($2)", [org.id, values.project]);
if (!project) exit(`No project "${values.project}" in ${values.org}.`);
const version = await one<{ id: string }>(db, "select id from project_versions where project_id = $1 and lower(name) = lower($2)", [project.id, values.version]);
if (!version) {
  const names = (await db.query<{ name: string }>("select name from project_versions where project_id = $1", [project.id])).map((v) => v.name);
  exit(`No version "${values.version}" in ${project.key}. Versions: ${names.join(", ") || "none"}.`);
}

// People who can be reporters: active members of the project.
const members = await db.query<{ id: string; full_name: string; email: string }>(
  `select u.id, u.full_name, u.email from project_members pm
     join organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
     join users u on u.id = pm.user_id
    where pm.project_id = $1`,
  [project.id],
);
const fallback = values.reporter ? members.find((m) => m.email.toLowerCase() === values.reporter!.toLowerCase()) : undefined;
if (values.reporter && !fallback) exit(`${values.reporter} isn't an active member of ${project.key}. Add them to the project first.`);

// Old captures named a level ("high"); match it to the project's levels by name, else the default level.
const severities = await listSeverities(org.id, project.id);
const severity = (v: string): string | null => severities.find((s) => s.name.toLowerCase() === v.trim().toLowerCase())?.id ?? null;
const priority = (v: string): Priority => {
  const p = v.toLowerCase();
  return p === "urgent" || p === "high" || p === "low" ? p : "medium";
};
const components = new Map(
  (await db.query<{ id: string; name: string }>("select id, name from project_components where project_id = $1 and archived_at is null", [project.id])).map((c) => [
    c.name.toLowerCase(),
    c.id,
  ]),
);

let imported = 0;
let skipped = 0;
for (const c of captures) {
  const ref = `capture:${c.id}`;
  if (await one(db, "select 1 from bugs where project_id = $1 and external_ref = $2", [project.id, ref])) {
    skipped++;
    continue;
  }
  // The old reporter was a token name; use the project member with that name if there is one.
  const reporter = members.find((m) => m.full_name.toLowerCase() === c.reporter.toLowerCase() || m.email.split("@")[0] === c.reporter) ?? fallback;
  if (!reporter) exit(`Capture #${c.number} was reported by "${c.reporter}", who isn't on ${project.key}. Pass --reporter <email>.`);

  let componentId: string | null = null;
  if (c.module.trim()) {
    componentId = components.get(c.module.trim().toLowerCase()) ?? null;
    if (!componentId) {
      componentId = await createComponent(org.id, project.id, c.module.trim());
      components.set(c.module.trim().toLowerCase(), componentId);
    }
  }

  const captureDir = path.join(dir, c.id);
  const log = JSON.parse(await readFile(path.join(captureDir, "log.json"), "utf8").catch(() => '{"network":[],"console":[]}')) as CaptureLog;
  const attachments = [];
  for (const m of c.media) {
    attachments.push({
      kind: m.kind,
      fileName: m.file,
      contentType: m.mime,
      bytes: new Uint8Array(await readFile(path.join(captureDir, m.file))),
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
      trimStartMs: m.trimStartMs,
      trimEndMs: m.trimEndMs,
    });
  }

  const bug = await createBug(org.id, {
    projectId: project.id,
    reporterId: reporter.id,
    title: c.title,
    description: c.description,
    foundInVersionId: version.id,
    componentId,
    severityId: severity(c.severity),
    priority: priority(c.priority),
    source: "browser_extension",
    externalRef: ref,
    createdAt: new Date(c.createdAt),
    attachments,
    capture: { page: c.page, log, capturedAt: new Date(c.createdAt) },
  });
  // Keep old share links working: /c/<id> redirects to /s/<id>, and the old id becomes the share token.
  await createShareLink(org.id, bug.id, reporter.id, null, c.id);
  console.log(`Imported capture #${c.number} as ${project.key}-${bug.number}: ${c.title}`);
  imported++;
}

console.log(`\nDone: ${imported} imported, ${skipped} already imported.`);
await db.close();
