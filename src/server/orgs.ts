import "server-only";
import { randomBytes } from "node:crypto";
import type { OrgKind } from "./access";
import { newToken, sha256 } from "./auth/crypto";
import { getDb, inOrg, one, type Queryable } from "./db";

export class UserError extends Error {}

/** Postgres error code for a unique constraint violation. */
export const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

async function roleId(q: Queryable, scope: "organization" | "project", key: string): Promise<string> {
  const row = await one<{ id: string }>(q, "select id from roles where organization_id is null and scope = $1 and key = $2", [scope, key]);
  if (!row) throw new Error(`Built-in role ${scope}/${key} is missing`);
  return row.id;
}


const randomSuffix = () => randomBytes(3).toString("hex");

/**
 * Creates an organization with the person as its owner. With `fallbackSlug`, a taken address gets a short
 * random ending instead of failing (sign-up has no address field to correct).
 */
export async function createOrganization(userId: string, name: string, slug: string, options: { fallbackSlug?: boolean } = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug.slice(0, 56)}-${randomSuffix()}`;
    try {
      return await insertOrganization(userId, name, candidate, "organization", "owner");
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (!options.fallbackSlug || attempt >= 4) throw new UserError("That address is taken. Try another one.");
    }
  }
}

/** The project every personal workspace has; personal accounts can't create others. */
const PERSONAL_PROJECT = { name: "My bugs", key: "BUG", version: "1.0", feature: "General" };

/**
 * Sets up a Personal account's workspace: a private organization with one project, ready to report to
 * (a version and a feature, which reports need). Returns its address.
 */
export async function createPersonalWorkspace(userId: string, fullName: string): Promise<string> {
  const base = slugify(fullName).slice(0, 48) || "me";
  for (let attempt = 0; ; attempt++) {
    try {
      return await insertOrganization(userId, "Personal", `${base}-${randomSuffix()}`, "personal", "personal");
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // The one-per-person rule: they already have one.
      const existing = await one<{ slug: string }>(
        await getDb(),
        "select slug from organizations where created_by = $1 and kind = 'personal' and deleted_at is null",
        [userId],
      );
      if (existing) return existing.slug;
      if (attempt >= 4) throw err;
    }
  }
}

async function insertOrganization(userId: string, name: string, slug: string, kind: OrgKind, roleKey: "owner" | "personal"): Promise<string> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const org = await one<{ id: string; slug: string }>(
      tx,
      "insert into organizations (name, slug, created_by, kind) values ($1, $2, $3, $4) returning id, slug",
      [name.trim(), slug, userId, kind],
    );
    await tx.query("select set_config('app.current_org_id', $1, true)", [org!.id]);
    await tx.query("insert into organization_members (organization_id, user_id, role_id) values ($1, $2, $3)", [
      org!.id,
      userId,
      await roleId(tx, "organization", roleKey),
    ]);
    if (kind === "personal") {
      const project = await one<{ id: string }>(
        tx,
        "insert into projects (organization_id, name, key, description, created_by) values ($1, $2, $3, $4, $5) returning id",
        [org!.id, PERSONAL_PROJECT.name, PERSONAL_PROJECT.key, "Bugs you report on your own.", userId],
      );
      await tx.query("insert into project_members (organization_id, project_id, user_id, role_id, added_by) values ($1, $2, $3, $4, $3)", [
        org!.id,
        project!.id,
        userId,
        await roleId(tx, "project", "manager"),
      ]);
      await tx.query(
        "insert into project_versions (organization_id, project_id, name, status, created_by) values ($1, $2, $3, 'in_testing', $4)",
        [org!.id, project!.id, PERSONAL_PROJECT.version, userId],
      );
      await tx.query("insert into project_components (organization_id, project_id, name) values ($1, $2, $3)", [
        org!.id,
        project!.id,
        PERSONAL_PROJECT.feature,
      ]);
    }
    await tx.query(
      "insert into audit_log (organization_id, actor_id, action, target_type, target_id) values ($1, $2, 'organization.created', 'organization', $1)",
      [org!.id, userId],
    );
    return org!.slug;
  });
}

// ---- Members ----

export interface Member {
  userId: string;
  fullName: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  jobTitle: string | null;
  status: string;
  joinedAt: Date;
}

export async function listMembers(orgId: string, includeRemoved = false): Promise<Member[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Member>(
      `select u.id as "userId", u.full_name as "fullName", u.email, r.id as "roleId", r.key as "roleKey",
              r.name as "roleName", m.job_title as "jobTitle", m.status, m.joined_at as "joinedAt"
         from organization_members m
         join users u on u.id = m.user_id
         join roles r on r.id = m.role_id
        where m.organization_id = $1 ${includeRemoved ? "" : "and m.status = 'active'"}
        order by u.full_name`,
      [orgId],
    ),
  );
}

export interface RoleOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export async function listRoles(orgId: string, scope: "organization" | "project"): Promise<RoleOption[]> {
  const db = await getDb();
  return db.query<RoleOption>(
    `select id, key, name, description from roles
      where scope = $1 and (organization_id is null or organization_id = $2)
        and key <> 'personal'  -- only for the owner of a personal workspace
      order by organization_id nulls first, created_at`,
    [scope, orgId],
  );
}

async function ownerCount(tx: Queryable, orgId: string): Promise<number> {
  const row = await one<{ n: number }>(
    tx,
    `select count(*)::int as n from organization_members m join roles r on r.id = m.role_id
      where m.organization_id = $1 and m.status = 'active' and r.key = 'owner' and r.organization_id is null`,
    [orgId],
  );
  return row?.n ?? 0;
}

export async function changeMemberRole(orgId: string, actorId: string, actorIsOwner: boolean, userId: string, newRoleId: string) {
  await inOrg(orgId, async (tx) => {
    const current = await one<{ role_key: string }>(
      tx,
      "select r.key as role_key from organization_members m join roles r on r.id = m.role_id where m.organization_id = $1 and m.user_id = $2 and m.status = 'active'",
      [orgId, userId],
    );
    const next = await one<{ key: string }>(tx, "select key from roles where id = $1 and scope = 'organization' and key <> 'personal'", [newRoleId]);
    if (!current || !next) throw new UserError("That member or role doesn't exist.");
    if ((current.role_key === "owner" || next.key === "owner") && !actorIsOwner) {
      throw new UserError("Only owners can make or unmake owners.");
    }
    if (current.role_key === "owner" && next.key !== "owner" && (await ownerCount(tx, orgId)) <= 1) {
      throw new UserError("An organization needs at least one owner.");
    }
    await tx.query("update organization_members set role_id = $3 where organization_id = $1 and user_id = $2", [orgId, userId, newRoleId]);
    await tx.query(
      "insert into audit_log (organization_id, actor_id, action, target_type, target_id, metadata) values ($1, $2, 'member.role_changed', 'user', $3, $4::jsonb)",
      [orgId, actorId, userId, JSON.stringify({ from: current.role_key, to: next.key })],
    );
  });
}

/** Removes someone: they lose access (and their project roles), but their bugs and comments stay theirs. */
export async function removeMember(orgId: string, actorId: string, actorIsOwner: boolean, userId: string) {
  await inOrg(orgId, async (tx) => {
    const current = await one<{ role_key: string }>(
      tx,
      "select r.key as role_key from organization_members m join roles r on r.id = m.role_id where m.organization_id = $1 and m.user_id = $2 and m.status = 'active'",
      [orgId, userId],
    );
    if (!current) throw new UserError("That person isn't a member.");
    if (current.role_key === "owner" && !actorIsOwner) throw new UserError("Only owners can remove owners.");
    if (current.role_key === "owner" && (await ownerCount(tx, orgId)) <= 1) {
      throw new UserError("An organization needs at least one owner.");
    }
    await tx.query(
      "update organization_members set status = 'removed', removed_at = now() where organization_id = $1 and user_id = $2",
      [orgId, userId],
    );
    await tx.query("delete from project_members where organization_id = $1 and user_id = $2", [orgId, userId]);
    await tx.query("delete from team_members where organization_id = $1 and user_id = $2", [orgId, userId]);
    await tx.query(
      "insert into audit_log (organization_id, actor_id, action, target_type, target_id) values ($1, $2, 'member.removed', 'user', $3)",
      [orgId, actorId, userId],
    );
  });
}

// ---- Invitations ----

const INVITE_DAYS = 7;

/** What an invited person does: build and fix (Developer), test (QA), or run the organization with you (Admin). */
export const INVITE_ROLES = {
  developer: { label: "Developer", orgRole: "member", projectRole: "developer" },
  sqa: { label: "QA", orgRole: "member", projectRole: "sqa" },
  admin: { label: "Admin", orgRole: "admin", projectRole: null },
} as const;
export type InviteRole = keyof typeof INVITE_ROLES;

export interface Invitation {
  id: string;
  email: string;
  /** "Developer", "SQA engineer" or the organization role for admins. */
  roleName: string;
  /** Project names, or null for every project. */
  projects: string[] | null;
  state: "pending" | "declined";
  emailed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Creates (or re-sends) an invitation and returns its id and the secret token for the link. `projectIds`
 * null means every active project when they accept.
 */
export async function createInvitation(
  orgId: string,
  invitedBy: string,
  email: string,
  role: InviteRole,
  projectIds: string[] | null,
): Promise<{ id: string; token: string }> {
  const token = newToken("inv");
  const spec = INVITE_ROLES[role];
  const id = await inOrg(orgId, async (tx) => {
    const org = await one<{ kind: OrgKind }>(tx, "select kind from organizations where id = $1", [orgId]);
    if (org?.kind !== "organization") throw new UserError("Personal workspaces can't have members.");
    const already = await one(
      tx,
      "select 1 from organization_members m join users u on u.id = m.user_id where m.organization_id = $1 and u.email = $2 and m.status = 'active'",
      [orgId, email],
    );
    if (already) throw new UserError(`${email} is already a member.`);
    if (projectIds) {
      const found = await tx.query("select id from projects where organization_id = $1 and id = any($2::uuid[]) and deleted_at is null", [
        orgId,
        projectIds,
      ]);
      if (found.length !== projectIds.length) throw new UserError("One of those projects no longer exists. Reload and try again.");
    }
    // Sending again replaces any earlier open invitation.
    await tx.query(
      "update invitations set revoked_at = now() where organization_id = $1 and email = $2 and accepted_at is null and revoked_at is null and declined_at is null",
      [orgId, email],
    );
    const row = await one<{ id: string }>(
      tx,
      `insert into invitations (organization_id, email, role_id, project_role_id, project_ids, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5::uuid[], $6, $7, now() + make_interval(days => $8)) returning id`,
      [
        orgId,
        email,
        await roleId(tx, "organization", spec.orgRole),
        spec.projectRole ? await roleId(tx, "project", spec.projectRole) : null,
        spec.projectRole ? projectIds : null,
        sha256(token),
        invitedBy,
        INVITE_DAYS,
      ],
    );
    return row!.id;
  });
  return { id, token };
}

export async function markInvitationEmailed(orgId: string, invitationId: string) {
  await inOrg(orgId, (tx) => tx.query("update invitations set emailed_at = now() where organization_id = $1 and id = $2", [orgId, invitationId]));
}

/** Invitations waiting for an answer, and ones declined in the last 30 days (so the inviter sees the answer). */
export async function listInvitations(orgId: string): Promise<Invitation[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Invitation>(
      `select i.id, i.email, coalesce(pr.name, r.name) as "roleName",
              case when i.project_role_id is null or i.project_ids is null then null
                   else array(select p.name from projects p where p.id = any(i.project_ids) and p.deleted_at is null order by p.name) end as projects,
              case when i.declined_at is null then 'pending' else 'declined' end as state,
              i.emailed_at is not null as emailed, i.expires_at as "expiresAt", i.created_at as "createdAt"
         from invitations i
         join roles r on r.id = i.role_id
         left join roles pr on pr.id = i.project_role_id
        where i.organization_id = $1 and i.accepted_at is null and i.revoked_at is null
          and ((i.declined_at is null and i.expires_at > now()) or i.declined_at > now() - interval '30 days')
        order by i.created_at desc`,
      [orgId],
    ),
  );
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update invitations set revoked_at = now() where organization_id = $1 and id = $2 and accepted_at is null and declined_at is null", [
      orgId,
      invitationId,
    ]),
  );
}

export interface InvitationDetails {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  email: string;
  /** "Developer", "SQA engineer", or "Admin". */
  roleName: string;
  inviterName: string | null;
  state: "open" | "expired" | "declined" | "used";
}

/** Looks up an invitation by its link token (before anyone is signed in). */
export async function findInvitation(token: string): Promise<InvitationDetails | null> {
  const db = await getDb();
  const row = await one<Omit<InvitationDetails, "state"> & { expired: boolean; declined: boolean; used: boolean }>(
    db,
    `select i.id, o.id as "orgId", o.name as "orgName", o.slug as "orgSlug", i.email, coalesce(pr.name, r.name) as "roleName",
            u.full_name as "inviterName", i.expires_at <= now() as expired, i.declined_at is not null as declined,
            (i.accepted_at is not null or i.revoked_at is not null) as used
       from invitations i
       join organizations o on o.id = i.organization_id and o.deleted_at is null
       join roles r on r.id = i.role_id
       left join roles pr on pr.id = i.project_role_id
       left join users u on u.id = i.invited_by
      where i.token_hash = $1`,
    [sha256(token)],
  );
  if (!row) return null;
  const { expired, declined, used, ...details } = row;
  return { ...details, state: used ? "used" : declined ? "declined" : expired ? "expired" : "open" };
}

/**
 * Accepts an invitation for the signed-in user; their email must match the invited one. They join the
 * organization, and the projects it names with its project role.
 */
export async function acceptInvitation(token: string, user: { id: string; email: string }): Promise<string> {
  const invite = await findInvitation(token);
  if (!invite || invite.state !== "open") throw new UserError("This invitation is no longer valid. Ask for a new one.");
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new UserError(`This invitation is for ${invite.email}. Sign in with that email to accept it.`);
  }
  await inOrg(invite.orgId, async (tx) => {
    const row = await one<{ role_id: string; project_role_id: string | null; project_ids: string[] | null; invited_by: string | null }>(
      tx,
      "select role_id, project_role_id, project_ids, invited_by from invitations where id = $1",
      [invite.id],
    );
    // Someone removed earlier gets their old membership back, so their history stays linked.
    await tx.query(
      `insert into organization_members (organization_id, user_id, role_id, invited_by)
       values ($1, $2, $3, $4)
       on conflict (organization_id, user_id)
       do update set role_id = excluded.role_id, status = 'active', removed_at = null, joined_at = now()`,
      [invite.orgId, user.id, row!.role_id, row!.invited_by],
    );
    if (row!.project_role_id) {
      await tx.query(
        `insert into project_members (organization_id, project_id, user_id, role_id, added_by)
         select $1, p.id, $2, $3, $5 from projects p
          where p.organization_id = $1 and p.deleted_at is null and p.status = 'active'
            and ($4::uuid[] is null or p.id = any($4::uuid[]))
         on conflict (project_id, user_id) do nothing`,
        [invite.orgId, user.id, row!.project_role_id, row!.project_ids, row!.invited_by],
      );
    }
    await tx.query("update invitations set accepted_at = now(), accepted_user_id = $2 where id = $1", [invite.id, user.id]);
    await tx.query(
      "insert into audit_log (organization_id, actor_id, action, target_type, target_id) values ($1, $2, 'invitation.accepted', 'user', $2)",
      [invite.orgId, user.id],
    );
  });
  return invite.orgSlug;
}

/** Declines an invitation. Holding the link is enough: nobody needs an account to say no. */
export async function declineInvitation(token: string): Promise<InvitationDetails> {
  const invite = await findInvitation(token);
  if (!invite || invite.state !== "open") throw new UserError("This invitation is no longer open.");
  await inOrg(invite.orgId, async (tx) => {
    await tx.query("update invitations set declined_at = now() where id = $1 and accepted_at is null and revoked_at is null", [invite.id]);
    await tx.query(
      "insert into audit_log (organization_id, action, target_type, target_id, metadata) values ($1, 'invitation.declined', 'invitation', $2, $3::jsonb)",
      [invite.orgId, invite.id, JSON.stringify({ email: invite.email })],
    );
  });
  return invite;
}
