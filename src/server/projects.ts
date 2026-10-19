import "server-only";
import { inOrg, one } from "./db";
import { isUniqueViolation, UserError } from "./orgs";

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  openBugs: number;
  totalBugs: number;
  latestVersion: string | null;
}

/** Projects the person can see: all of them for admins, otherwise the ones they're a member of. */
export async function listProjects(orgId: string, userId: string, isAdmin: boolean): Promise<ProjectSummary[]> {
  return inOrg(orgId, (tx) =>
    tx.query<ProjectSummary>(
      `select p.id, p.key, p.name, p.description, p.status,
              (select count(*)::int from bugs b where b.project_id = p.id and b.deleted_at is null and b.resolved_at is null) as "openBugs",
              (select count(*)::int from bugs b where b.project_id = p.id and b.deleted_at is null) as "totalBugs",
              (select v.name from project_versions v where v.project_id = p.id and v.status <> 'archived'
                order by v.sort_order desc, v.created_at desc limit 1) as "latestVersion"
         from projects p
        where p.organization_id = $1 and p.deleted_at is null
          and ($3 or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = $2))
        order by p.status, p.name`,
      [orgId, userId, isAdmin],
    ),
  );
}

export async function createProject(
  orgId: string,
  userId: string,
  input: { name: string; key: string; description: string; firstVersion: string },
): Promise<string> {
  try {
    return await inOrg(orgId, async (tx) => {
      const project = await one<{ id: string; key: string }>(
        tx,
        "insert into projects (organization_id, name, key, description, created_by) values ($1, $2, $3, nullif($4, ''), $5) returning id, key",
        [orgId, input.name.trim(), input.key, input.description.trim(), userId],
      );
      const manager = await one<{ id: string }>(tx, "select id from roles where organization_id is null and scope = 'project' and key = 'manager'");
      await tx.query("insert into project_members (organization_id, project_id, user_id, role_id, added_by) values ($1, $2, $3, $4, $3)", [
        orgId,
        project!.id,
        userId,
        manager!.id,
      ]);
      if (input.firstVersion.trim()) {
        await tx.query(
          "insert into project_versions (organization_id, project_id, name, status, created_by) values ($1, $2, $3, 'in_testing', $4)",
          [orgId, project!.id, input.firstVersion.trim(), userId],
        );
      }
      return project!.key;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("A project with that name or key already exists.");
    throw err;
  }
}

export async function updateProject(orgId: string, projectId: string, input: { name: string; description: string; archived: boolean }) {
  try {
    await inOrg(orgId, (tx) =>
      tx.query(
        `update projects set name = $3, description = nullif($4, ''),
                status = case when $5 then 'archived'::project_status else 'active'::project_status end,
                archived_at = case when $5 then coalesce(archived_at, now()) else null end
          where organization_id = $1 and id = $2`,
        [orgId, projectId, input.name.trim(), input.description.trim(), input.archived],
      ),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("Another project already has that name.");
    throw err;
  }
}

// ---- Versions ----

export interface Version {
  id: string;
  name: string;
  status: string;
  releaseDate: string | null;
  releasedAt: Date | null;
  bugCount: number;
  openBugCount: number;
}

export const VERSION_STATUSES = ["planned", "in_development", "in_testing", "released", "archived"] as const;

export async function listVersions(orgId: string, projectId: string): Promise<Version[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Version>(
      `select v.id, v.name, v.status, to_char(v.release_date, 'YYYY-MM-DD') as "releaseDate", v.released_at as "releasedAt",
              (select count(*)::int from bugs b where b.found_in_version_id = v.id and b.deleted_at is null) as "bugCount",
              (select count(*)::int from bugs b where b.found_in_version_id = v.id and b.deleted_at is null and b.resolved_at is null) as "openBugCount"
         from project_versions v
        where v.project_id = $1
        order by v.sort_order desc, v.created_at desc`,
      [projectId],
    ),
  );
}

export async function createVersion(orgId: string, projectId: string, userId: string, name: string, status: string, releaseDate: string | null) {
  try {
    await inOrg(orgId, async (tx) => {
      const next = await one<{ n: number }>(tx, "select coalesce(max(sort_order), 0) + 1 as n from project_versions where project_id = $1", [projectId]);
      await tx.query(
        `insert into project_versions (organization_id, project_id, name, status, release_date, released_at, sort_order, created_by)
         values ($1, $2, $3, $4::version_status, $5::date, case when $4 = 'released' then now() end, $6, $7)`,
        [orgId, projectId, name.trim(), status, releaseDate, next!.n, userId],
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("This project already has a version with that name.");
    throw err;
  }
}

export async function setVersionStatus(orgId: string, projectId: string, versionId: string, status: string) {
  await inOrg(orgId, (tx) =>
    tx.query(
      `update project_versions
          set status = $4::version_status,
              released_at = case when $4 in ('released', 'archived') then coalesce(released_at, case when $4 = 'released' then now() end) else null end
        where organization_id = $1 and project_id = $2 and id = $3`,
      [orgId, projectId, versionId, status],
    ),
  );
}

// ---- Components (features) ----

export interface Component {
  id: string;
  name: string;
  parentId: string | null;
  bugCount: number;
}

export async function listComponents(orgId: string, projectId: string): Promise<Component[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Component>(
      `select c.id, c.name, c.parent_id as "parentId",
              (select count(*)::int from bugs b where b.component_id = c.id and b.deleted_at is null) as "bugCount"
         from project_components c
        where c.project_id = $1 and c.archived_at is null
        order by lower(c.name)`,
      [projectId],
    ),
  );
}

export async function createComponent(orgId: string, projectId: string, name: string): Promise<string> {
  try {
    return await inOrg(orgId, async (tx) => {
      const row = await one<{ id: string }>(
        tx,
        "insert into project_components (organization_id, project_id, name) values ($1, $2, $3) returning id",
        [orgId, projectId, name.trim()],
      );
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("There's already a feature with that name.");
    throw err;
  }
}

export async function archiveComponent(orgId: string, projectId: string, componentId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update project_components set archived_at = now() where organization_id = $1 and project_id = $2 and id = $3", [
      orgId,
      projectId,
      componentId,
    ]),
  );
}

// ---- Platforms (Admin panel, User website, User app, ...) ----

export interface Platform {
  id: string;
  name: string;
  bugCount: number;
}

/** A project's platforms in the order they were added, which is also the order of the bug list's tabs. */
export async function listPlatforms(orgId: string, projectId: string): Promise<Platform[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Platform>(
      `select p.id, p.name,
              (select count(*)::int from bugs b where b.platform_id = p.id and b.deleted_at is null) as "bugCount"
         from project_platforms p
        where p.project_id = $1 and p.archived_at is null
        order by p.position, p.created_at`,
      [projectId],
    ),
  );
}

export async function createPlatform(orgId: string, projectId: string, name: string): Promise<string> {
  try {
    return await inOrg(orgId, async (tx) => {
      const row = await one<{ id: string }>(
        tx,
        `insert into project_platforms (organization_id, project_id, name, position)
         values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from project_platforms where project_id = $2))
         returning id`,
        [orgId, projectId, name.trim()],
      );
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("There's already a platform with that name.");
    throw err;
  }
}

/** Removes a platform from the pickers; bugs found on it keep it. */
export async function archivePlatform(orgId: string, projectId: string, platformId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update project_platforms set archived_at = now() where organization_id = $1 and project_id = $2 and id = $3", [
      orgId,
      projectId,
      platformId,
    ]),
  );
}

// ---- Project members ----

export interface ProjectMember {
  userId: string;
  fullName: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
}

export async function listProjectMembers(orgId: string, projectId: string): Promise<ProjectMember[]> {
  return inOrg(orgId, (tx) =>
    tx.query<ProjectMember>(
      `select u.id as "userId", u.full_name as "fullName", u.email, r.id as "roleId", r.key as "roleKey", r.name as "roleName"
         from project_members pm
         join users u on u.id = pm.user_id
         join roles r on r.id = pm.role_id
         join organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id and om.status = 'active'
        where pm.project_id = $1
        order by u.full_name`,
      [projectId],
    ),
  );
}

export async function setProjectMember(orgId: string, projectId: string, userId: string, roleId: string, addedBy: string) {
  await inOrg(orgId, async (tx) => {
    const ok = await one(
      tx,
      "select 1 from roles where id = $1 and scope = 'project' and (organization_id is null or organization_id = $2)",
      [roleId, orgId],
    );
    if (!ok) throw new UserError("Pick a project role.");
    await tx.query(
      `insert into project_members (organization_id, project_id, user_id, role_id, added_by) values ($1, $2, $3, $4, $5)
       on conflict (project_id, user_id) do update set role_id = excluded.role_id`,
      [orgId, projectId, userId, roleId, addedBy],
    );
  });
}

export async function removeProjectMember(orgId: string, projectId: string, userId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("delete from project_members where organization_id = $1 and project_id = $2 and user_id = $3", [orgId, projectId, userId]),
  );
}
