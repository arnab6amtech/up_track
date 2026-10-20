import "server-only";
import { inOrg, one, type Queryable } from "./db";
import { isUniqueViolation, UserError } from "./orgs";

/**
 * A project's bug statuses and severity levels, which its members manage in the project's settings.
 * Both lists are ordered (position), have one default for new bugs, and keep removed entries (archived)
 * so old bugs and their history still name them. Every query names the project as well as the
 * organization (the organization for row-level security).
 */

export const STATUS_CATEGORIES = ["open", "in_progress", "in_review", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABEL: Record<StatusCategory, string> = {
  open: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export interface ManagedStatus {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
  isDefault: boolean;
  bugCount: number;
}

export interface Severity {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface ManagedSeverity extends Severity {
  bugCount: number;
}

const COLOR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#64748b";

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new UserError("Give it a name.");
  if (trimmed.length > 50) throw new UserError("Keep the name under 50 characters.");
  return trimmed;
}

const cleanColor = (color: string) => (COLOR.test(color) ? color.toLowerCase() : FALLBACK_COLOR);

const nameTaken = (err: unknown, what: string) =>
  isUniqueViolation(err) ? new UserError(`There's already a ${what} with that name.`) : err;

// ---- Reading ----

/** A project's severity levels for pickers, most severe first. */
export async function listSeverities(orgId: string, projectId: string): Promise<Severity[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Severity>(
      `select id, name, color, is_default as "isDefault" from bug_severities
        where organization_id = $1 and project_id = $2 and archived_at is null order by position`,
      [orgId, projectId],
    ),
  );
}

/** Both lists with how many bugs use each entry, for the project's settings. */
export async function listWorkflow(orgId: string, projectId: string): Promise<{ statuses: ManagedStatus[]; severities: ManagedSeverity[] }> {
  return inOrg(orgId, async (tx) => {
    const statuses = await tx.query<ManagedStatus>(
      `select s.id, s.name, coalesce(s.color, '${FALLBACK_COLOR}') as color, s.category, s.is_initial as "isDefault",
              (select count(*)::int from bugs b where b.status_id = s.id and b.deleted_at is null) as "bugCount"
         from workflow_statuses s
        where s.organization_id = $1 and s.project_id = $2 and s.archived_at is null
        order by s.position`,
      [orgId, projectId],
    );
    const severities = await tx.query<ManagedSeverity>(
      `select v.id, v.name, v.color, v.is_default as "isDefault",
              (select count(*)::int from bugs b where b.severity_id = v.id and b.deleted_at is null) as "bugCount"
         from bug_severities v
        where v.organization_id = $1 and v.project_id = $2 and v.archived_at is null
        order by v.position`,
      [orgId, projectId],
    );
    return { statuses, severities };
  });
}

// ---- Shared: ordering ----

type Table = "workflow_statuses" | "bug_severities";

/** Moves an entry one place up or down by swapping positions with its neighbour. */
async function move(tx: Queryable, table: Table, projectId: string, id: string, direction: "up" | "down") {
  const rows = await tx.query<{ id: string; position: number }>(
    `select id, position from ${table} where project_id = $1 and archived_at is null order by position`,
    [projectId],
  );
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  // Positions are unique, but checked at commit, so the swap can pass through a duplicate.
  await tx.query(`update ${table} set position = $3 where project_id = $1 and id = $2`, [projectId, rows[i].id, rows[j].position]);
  await tx.query(`update ${table} set position = $3 where project_id = $1 and id = $2`, [projectId, rows[j].id, rows[i].position]);
}

async function nextPosition(tx: Queryable, table: Table, projectId: string): Promise<number> {
  const row = await one<{ n: number }>(tx, `select coalesce(max(position), 0) + 1 as n from ${table} where project_id = $1`, [projectId]);
  return row!.n;
}

async function bugsUsing(tx: Queryable, column: "status_id" | "severity_id", id: string): Promise<number> {
  const row = await one<{ n: number }>(tx, `select count(*)::int as n from bugs where ${column} = $1 and deleted_at is null`, [id]);
  return row!.n;
}

const plural = (n: number) => `${n} ${n === 1 ? "bug" : "bugs"}`;

// ---- Statuses ----

function cleanCategory(category: string): StatusCategory {
  if (!(STATUS_CATEGORIES as readonly string[]).includes(category)) throw new UserError("Pick what the status means.");
  return category as StatusCategory;
}

/** At least one status bugs can be worked in, and one that closes them. */
async function checkStatusBalance(tx: Queryable, projectId: string) {
  const row = await one<{ open: number; done: number }>(
    tx,
    `select count(*) filter (where category <> 'done')::int as open, count(*) filter (where category = 'done')::int as done
       from workflow_statuses where project_id = $1 and archived_at is null`,
    [projectId],
  );
  if (!row?.done) throw new UserError("Keep at least one Done status, so bugs can be closed.");
  if (!row.open) throw new UserError("Keep at least one status that isn't Done, for bugs still being worked on.");
}

export async function addStatus(orgId: string, projectId: string, input: { name: string; color: string; category: string }) {
  const name = cleanName(input.name);
  const category = cleanCategory(input.category);
  try {
    await inOrg(orgId, async (tx) => {
      await tx.query(
        "insert into workflow_statuses (organization_id, project_id, name, color, category, position) values ($1, $2, $3, $4, $5::status_category, $6)",
        [orgId, projectId, name, cleanColor(input.color), category, await nextPosition(tx, "workflow_statuses", projectId)],
      );
    });
  } catch (err) {
    throw nameTaken(err, "status");
  }
}

export async function updateStatus(orgId: string, projectId: string, id: string, input: { name: string; color: string; category: string }) {
  const name = cleanName(input.name);
  const category = cleanCategory(input.category);
  try {
    await inOrg(orgId, async (tx) => {
      const current = await one<{ is_initial: boolean }>(
        tx,
        "select is_initial from workflow_statuses where project_id = $1 and id = $2 and archived_at is null",
        [projectId, id],
      );
      if (!current) throw new UserError("That status was removed. Reload the page.");
      if (current.is_initial && category !== "open") {
        throw new UserError("New bugs start in the default status, so it has to mean To do. Make another status the default first.");
      }
      await tx.query(
        "update workflow_statuses set name = $3, color = $4, category = $5::status_category where project_id = $1 and id = $2",
        [projectId, id, name, cleanColor(input.color), category],
      );
      await checkStatusBalance(tx, projectId);
    });
  } catch (err) {
    throw nameTaken(err, "status");
  }
}

/** New bugs start in this status. It has to mean "To do". */
export async function setDefaultStatus(orgId: string, projectId: string, id: string) {
  await inOrg(orgId, async (tx) => {
    const target = await one<{ category: string }>(
      tx,
      "select category from workflow_statuses where project_id = $1 and id = $2 and archived_at is null",
      [projectId, id],
    );
    if (!target) throw new UserError("That status was removed. Reload the page.");
    if (target.category !== "open") throw new UserError("Only a To do status can be where new bugs start.");
    await tx.query("update workflow_statuses set is_initial = false where project_id = $1 and is_initial", [projectId]);
    await tx.query("update workflow_statuses set is_initial = true where project_id = $1 and id = $2", [projectId, id]);
  });
}

export async function moveStatus(orgId: string, projectId: string, id: string, direction: "up" | "down") {
  await inOrg(orgId, (tx) => move(tx, "workflow_statuses", projectId, id, direction));
}

/** Removes a status nobody's bugs are in; old history keeps its name. */
export async function removeStatus(orgId: string, projectId: string, id: string) {
  await inOrg(orgId, async (tx) => {
    const status = await one<{ name: string; is_initial: boolean }>(
      tx,
      "select name, is_initial from workflow_statuses where project_id = $1 and id = $2 and archived_at is null",
      [projectId, id],
    );
    if (!status) return;
    if (status.is_initial) throw new UserError(`New bugs start in ${status.name}. Make another status the default first.`);
    const used = await bugsUsing(tx, "status_id", id);
    if (used) throw new UserError(`${plural(used)} ${used === 1 ? "is" : "are"} in ${status.name}. Move ${used === 1 ? "it" : "them"} to another status first.`);
    await tx.query("update workflow_statuses set archived_at = now() where project_id = $1 and id = $2", [projectId, id]);
    await checkStatusBalance(tx, projectId);
  });
}

// ---- Severity levels ----

export async function addSeverity(orgId: string, projectId: string, input: { name: string; color: string }) {
  const name = cleanName(input.name);
  try {
    await inOrg(orgId, async (tx) => {
      await tx.query("insert into bug_severities (organization_id, project_id, name, color, position) values ($1, $2, $3, $4, $5)", [
        orgId,
        projectId,
        name,
        cleanColor(input.color),
        await nextPosition(tx, "bug_severities", projectId),
      ]);
    });
  } catch (err) {
    throw nameTaken(err, "severity level");
  }
}

export async function updateSeverity(orgId: string, projectId: string, id: string, input: { name: string; color: string }) {
  const name = cleanName(input.name);
  try {
    await inOrg(orgId, async (tx) => {
      const updated = await tx.query(
        "update bug_severities set name = $3, color = $4 where project_id = $1 and id = $2 and archived_at is null returning id",
        [projectId, id, name, cleanColor(input.color)],
      );
      if (updated.length === 0) throw new UserError("That severity level was removed. Reload the page.");
    });
  } catch (err) {
    throw nameTaken(err, "severity level");
  }
}

/** New bugs get this level unless the reporter picks another. */
export async function setDefaultSeverity(orgId: string, projectId: string, id: string) {
  await inOrg(orgId, async (tx) => {
    const exists = await one(tx, "select 1 from bug_severities where project_id = $1 and id = $2 and archived_at is null", [projectId, id]);
    if (!exists) throw new UserError("That severity level was removed. Reload the page.");
    await tx.query("update bug_severities set is_default = false where project_id = $1 and is_default", [projectId]);
    await tx.query("update bug_severities set is_default = true where project_id = $1 and id = $2", [projectId, id]);
  });
}

export async function moveSeverity(orgId: string, projectId: string, id: string, direction: "up" | "down") {
  await inOrg(orgId, (tx) => move(tx, "bug_severities", projectId, id, direction));
}

export async function removeSeverity(orgId: string, projectId: string, id: string) {
  await inOrg(orgId, async (tx) => {
    const level = await one<{ name: string; is_default: boolean }>(
      tx,
      "select name, is_default from bug_severities where project_id = $1 and id = $2 and archived_at is null",
      [projectId, id],
    );
    if (!level) return;
    if (level.is_default) throw new UserError(`New bugs get ${level.name}. Make another level the default first.`);
    const used = await bugsUsing(tx, "severity_id", id);
    if (used) throw new UserError(`${plural(used)} ${used === 1 ? "is" : "are"} ${level.name}. Change ${used === 1 ? "its" : "their"} severity first.`);
    await tx.query("update bug_severities set archived_at = now() where project_id = $1 and id = $2", [projectId, id]);
  });
}

/** The id when it's one of the project's current levels, else null (so the default applies). */
export async function validSeverity(orgId: string, projectId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const levels = await listSeverities(orgId, projectId);
  return levels.some((l) => l.id === id) ? id : null;
}
