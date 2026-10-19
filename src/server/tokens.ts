import "server-only";
import { newToken, sha256 } from "./auth/crypto";
import { getDb, inOrg, one } from "./db";

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function listTokens(orgId: string, userId: string): Promise<ApiToken[]> {
  return inOrg(orgId, (tx) =>
    tx.query<ApiToken>(
      `select id, name, token_prefix as "tokenPrefix", last_used_at as "lastUsedAt", expires_at as "expiresAt", created_at as "createdAt"
         from api_tokens where organization_id = $1 and user_id = $2 and revoked_at is null
        order by created_at desc`,
      [orgId, userId],
    ),
  );
}

/** Creates a personal token and returns the secret once; only its hash and a short prefix are kept. */
export async function createToken(orgId: string, userId: string, name: string, expiresInDays: number | null): Promise<string> {
  const token = newToken("upt");
  await inOrg(orgId, (tx) =>
    tx.query(
      `insert into api_tokens (organization_id, user_id, name, token_prefix, token_hash, scopes, expires_at)
       values ($1, $2, $3, $4, $5, '{}', case when $6::int is null then null else now() + make_interval(days => $6::int) end)`,
      [orgId, userId, name.trim(), token.slice(0, 12), sha256(token), expiresInDays],
    ),
  );
  return token;
}

export async function revokeToken(orgId: string, userId: string, tokenId: string) {
  await inOrg(orgId, (tx) =>
    tx.query("update api_tokens set revoked_at = now() where organization_id = $1 and user_id = $2 and id = $3", [orgId, userId, tokenId]),
  );
}

export interface TokenCaller {
  tokenId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  userId: string;
  userName: string;
  /** Owners/admins see every project; everyone else only their projects. */
  isAdmin: boolean;
}

/** Who a request's "Authorization: Bearer upt_…" token belongs to, or null if it's missing or invalid. */
export async function authenticateToken(request: Request): Promise<TokenCaller | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const db = await getDb();
  const row = await one<{ token_id: string; organization_id: string; user_id: string }>(db, "select * from resolve_api_token($1)", [sha256(token)]);
  if (!row) return null;
  const details = await one<{ slug: string; org_name: string; full_name: string; is_admin: boolean; last_used_at: Date | null }>(
    db,
    `select o.slug, o.name as org_name, u.full_name,
            exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = 'org.manage_members') as is_admin,
            t.last_used_at
       from organization_members m
       join organizations o on o.id = m.organization_id
       join users u on u.id = m.user_id
       join api_tokens t on t.id = $3
      where m.organization_id = $1 and m.user_id = $2`,
    [row.organization_id, row.user_id, row.token_id],
  );
  if (!details) return null;
  if (!details.last_used_at || Date.now() - new Date(details.last_used_at).getTime() > 5 * 60 * 1000) {
    await db.query("update api_tokens set last_used_at = now() where id = $1", [row.token_id]);
  }
  return {
    tokenId: row.token_id,
    orgId: row.organization_id,
    orgSlug: details.slug,
    orgName: details.org_name,
    userId: row.user_id,
    userName: details.full_name,
    isAdmin: details.is_admin,
  };
}
