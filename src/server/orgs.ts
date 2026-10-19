import "server-only";
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

export async function createOrganization(userId: string, name: string, slug: string): Promise<string> {
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const org = await one<{ id: string; slug: string }>(
        tx,
        "insert into organizations (name, slug, created_by) values ($1, $2, $3) returning id, slug",
        [name.trim(), slug, userId],
      );
      await tx.query("insert into organization_members (organization_id, user_id, role_id) values ($1, $2, $3)", [
        org!.id,
        userId,
        await roleId(tx, "organization", "owner"),
      ]);
      await tx.query(
        "insert into audit_log (organization_id, actor_id, action, target_type, target_id) values ($1, $2, 'organization.created', 'organization', $1)",
        [org!.id, userId],
      );
      return org!.slug;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("That address is taken. Try another one.");
    throw err;
  }
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
    const next = await one<{ key: string }>(tx, "select key from roles where id = $1 and scope = 'organization'", [newRoleId]);
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

export interface Invitation {
  id: string;
  email: string;
  roleName: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Creates (or re-sends) an invitation and returns the secret token for the link. */
export async function createInvitation(orgId: string, invitedBy: string, email: string, roleId: string): Promise<string> {
  const token = newToken("inv");
  await inOrg(orgId, async (tx) => {
    const role = await one(tx, "select 1 from roles where id = $1 and scope = 'organization' and (organization_id is null or organization_id = $2)", [
      roleId,
      orgId,
    ]);
    if (!role) throw new UserError("Pick a role.");
    const already = await one(
      tx,
      "select 1 from organization_members m join users u on u.id = m.user_id where m.organization_id = $1 and u.email = $2 and m.status = 'active'",
      [orgId, email],
    );
    if (already) throw new UserError("That person is already a member.");
    // Sending again replaces any earlier open invitation.
    await tx.query("update invitations set revoked_at = now() where organization_id = $1 and email = $2 and accepted_at is null and revoked_at is null", [
      orgId,
      email,
    ]);
    await tx.query(
      `insert into invitations (organization_id, email, role_id, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))`,
      [orgId, email, roleId, sha256(token), invitedBy, INVITE_DAYS],
    );
  });
  return token;
}

export async function listOpenInvitations(orgId: string): Promise<Invitation[]> {
  return inOrg(orgId, (tx) =>
    tx.query<Invitation>(
      `select i.id, i.email, r.name as "roleName", i.expires_at as "expiresAt", i.created_at as "createdAt"
         from invitations i join roles r on r.id = i.role_id
        where i.organization_id = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
        order by i.created_at desc`,
      [orgId],
    ),
  );
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update invitations set revoked_at = now() where organization_id = $1 and id = $2 and accepted_at is null", [orgId, invitationId]),
  );
}

export interface InvitationDetails {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  email: string;
  roleName: string;
  state: "open" | "expired" | "used";
}

/** Looks up an invitation by its link token (before anyone is signed in). */
export async function findInvitation(token: string): Promise<InvitationDetails | null> {
  const db = await getDb();
  const row = await one<InvitationDetails & { expired: boolean; used: boolean }>(
    db,
    `select i.id, o.id as "orgId", o.name as "orgName", o.slug as "orgSlug", i.email, r.name as "roleName",
            i.expires_at <= now() as expired, (i.accepted_at is not null or i.revoked_at is not null) as used
       from invitations i
       join organizations o on o.id = i.organization_id and o.deleted_at is null
       join roles r on r.id = i.role_id
      where i.token_hash = $1`,
    [sha256(token)],
  );
  if (!row) return null;
  return { ...row, state: row.used ? "used" : row.expired ? "expired" : "open" };
}

/** Accepts an invitation for the signed-in user; their email must match the invited one. */
export async function acceptInvitation(token: string, user: { id: string; email: string }): Promise<string> {
  const invite = await findInvitation(token);
  if (!invite || invite.state !== "open") throw new UserError("This invitation is no longer valid. Ask for a new one.");
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new UserError(`This invitation is for ${invite.email}. Sign in with that email to accept it.`);
  }
  await inOrg(invite.orgId, async (tx) => {
    const roleRow = await one<{ role_id: string }>(tx, "select role_id from invitations where id = $1", [invite.id]);
    // Someone removed earlier gets their old membership back, so their history stays linked.
    await tx.query(
      `insert into organization_members (organization_id, user_id, role_id)
       values ($1, $2, $3)
       on conflict (organization_id, user_id)
       do update set role_id = excluded.role_id, status = 'active', removed_at = null, joined_at = now()`,
      [invite.orgId, user.id, roleRow!.role_id],
    );
    await tx.query("update invitations set accepted_at = now(), accepted_user_id = $2 where id = $1", [invite.id, user.id]);
  });
  return invite.orgSlug;
}
