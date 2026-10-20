import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser, type CurrentUser } from "./auth/session";
import { getDb, one } from "./db";

export type OrgKind = "organization" | "personal";

export interface OrgContext {
  org: { id: string; name: string; slug: string; kind: OrgKind };
  user: CurrentUser;
  role: { key: string; name: string };
  permissions: Set<string>;
  /** Owners and admins: every project permission on every project. */
  isAdmin: boolean;
}

export interface ProjectAccess {
  project: { id: string; key: string; name: string; description: string | null; status: string };
  /** The person's project role, or null for admins who aren't project members. */
  role: { key: string; name: string } | null;
  permissions: Set<string>;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  kind: OrgKind;
  roleKey: string;
  roleName: string;
  /** Owners and admins: every project. */
  isAdmin: boolean;
}

/** The organizations someone belongs to: team organizations first, their personal workspace last. */
export const listMyOrganizations = cache(async (userId: string): Promise<OrgSummary[]> => {
  const db = await getDb();
  return db.query<OrgSummary>(
    `select o.id, o.name, o.slug, o.kind, r.key as "roleKey", r.name as "roleName",
            exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = 'org.manage_members') as "isAdmin"
       from organization_members m
       join organizations o on o.id = m.organization_id
       join roles r on r.id = m.role_id
      where m.user_id = $1 and m.status = 'active' and o.deleted_at is null
      order by o.kind = 'personal', o.name`,
    [userId],
  );
});

/**
 * Someone's account type, worked out the same way for the web app and the extension: "organization" when
 * they belong to any team organization (as owner or invited member), otherwise "personal".
 */
export interface AccountSummary {
  type: "organization" | "personal";
  organizations: OrgSummary[];
  /** Their personal workspace, if they have one. */
  personal: OrgSummary | null;
}

export async function describeAccount(userId: string): Promise<AccountSummary> {
  const all = await listMyOrganizations(userId);
  const organizations = all.filter((o) => o.kind === "organization");
  return { type: organizations.length ? "organization" : "personal", organizations, personal: all.find((o) => o.kind === "personal") ?? null };
}

/** The signed-in person's membership of an organization; 404 if they aren't an active member. */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser(`/o/${slug}`);
  const db = await getDb();
  const row = await one<{ id: string; name: string; slug: string; kind: OrgKind; role_key: string; role_name: string; permissions: string[] }>(
    db,
    `select o.id, o.name, o.slug, o.kind, r.key as role_key, r.name as role_name,
            array(select permission_key from role_permissions rp where rp.role_id = m.role_id) as permissions
       from organizations o
       join organization_members m on m.organization_id = o.id and m.user_id = $2 and m.status = 'active'
       join roles r on r.id = m.role_id
      where o.slug = $1 and o.deleted_at is null`,
    [slug, user.id],
  );
  if (!row) notFound();
  const permissions = new Set(row.permissions);
  return {
    org: { id: row.id, name: row.name, slug: row.slug, kind: row.kind },
    user,
    role: { key: row.role_key, name: row.role_name },
    permissions,
    isAdmin: permissions.has("org.manage_members"),
  };
});

const projectPermissionKeys = cache(async () => {
  const db = await getDb();
  return (await db.query<{ key: string }>("select key from permissions where scope = 'project'")).map((r) => r.key);
});

/** A project and what the person may do in it; 404 if it doesn't exist or they can't see it. */
export const getProjectAccess = cache(async (orgSlug: string, projectKey: string): Promise<ProjectAccess> => {
  const ctx = await getOrgContext(orgSlug);
  const db = await getDb();
  const row = await one<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    status: string;
    role_key: string | null;
    role_name: string | null;
    permissions: string[] | null;
  }>(
    db,
    `select p.id, p.key, p.name, p.description, p.status, r.key as role_key, r.name as role_name,
            case when pm.role_id is null then null
                 else array(select permission_key from role_permissions rp where rp.role_id = pm.role_id) end as permissions
       from projects p
       left join project_members pm on pm.project_id = p.id and pm.user_id = $3
       left join roles r on r.id = pm.role_id
      where p.organization_id = $1 and p.key = $2 and p.deleted_at is null`,
    [ctx.org.id, projectKey.toUpperCase(), ctx.user.id],
  );
  if (!row || (!ctx.isAdmin && !row.role_key)) notFound();
  const permissions = new Set(ctx.isAdmin ? await projectPermissionKeys() : (row.permissions ?? []));
  return {
    project: { id: row.id, key: row.key, name: row.name, description: row.description, status: row.status },
    role: row.role_key ? { key: row.role_key, name: row.role_name! } : null,
    permissions,
  };
});

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export function assertCan(permissions: Set<string>, permission: string) {
  if (!permissions.has(permission)) throw new PermissionError();
}

/** Whether someone may see a project's bugs: an active member who is an admin or on the project. */
export async function canViewProject(userId: string, orgId: string, projectId: string): Promise<boolean> {
  const db = await getDb();
  return !!(await one(
    db,
    `select 1 from organization_members m
      where m.organization_id = $1 and m.user_id = $2 and m.status = 'active'
        and (exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = 'org.manage_members')
             or exists (select 1 from project_members pm where pm.project_id = $3 and pm.user_id = $2))`,
    [orgId, userId, projectId],
  ));
}
