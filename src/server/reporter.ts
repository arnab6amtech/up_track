import "server-only";
import { publicOrigin } from "@/lib/origin";
import { getCurrentUser } from "./auth/session";
import { getDb } from "./db";
import { authenticateToken } from "./tokens";

export interface ReporterOrg {
  id: string;
  slug: string;
  name: string;
  /** Owners/admins can report to every project; everyone else only to their projects. */
  isAdmin: boolean;
}

/** Who is reporting from the browser extension, and to which organizations. */
export interface Reporter {
  userId: string;
  userName: string;
  /** "token": an API token from the extension's settings. "session": the browser's UpTrack sign-in. */
  via: "token" | "session";
  /** The token's organization, or every organization the signed-in person belongs to. */
  orgs: ReporterOrg[];
  /** An API token was sent but no longer works, so the browser's sign-in was used instead. */
  tokenRejected: boolean;
}

export type ReporterAuth = { reporter: Reporter } | { error: string; status: 401 | 403 };

/**
 * Pages served by browser extensions, and UpTrack itself. Other sites can't send a signed-in POST anyway
 * (the session cookie is SameSite=Lax), but a check on Origin also covers sibling subdomains.
 */
async function trustedOrigin(request: Request): Promise<boolean> {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (/^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin)) return true;
  return origin === (await publicOrigin()) || origin === new URL(request.url).origin;
}

/**
 * Authenticates a request from the browser extension: an API token if one is sent and valid, otherwise the
 * person's UpTrack session in this browser (the extension sends cookies along).
 */
export async function authenticateReporter(request: Request): Promise<ReporterAuth> {
  const sentToken = /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "");
  if (sentToken) {
    const caller = await authenticateToken(request);
    if (caller) {
      return {
        reporter: {
          userId: caller.userId,
          userName: caller.userName,
          via: "token",
          orgs: [{ id: caller.orgId, slug: caller.orgSlug, name: caller.orgName, isAdmin: caller.isAdmin }],
          tokenRejected: false,
        },
      };
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      status: 401,
      error: sentToken
        ? "The API token in the extension's settings is revoked or expired. Sign in to UpTrack in this browser, or paste a new token."
        : "You're not signed in to UpTrack in this browser. Sign in, then try again.",
    };
  }
  if (request.method !== "GET" && !(await trustedOrigin(request))) {
    return { status: 403, error: "Reports can only be sent from the UpTrack extension." };
  }
  const orgs = await (await getDb()).query<ReporterOrg>(
    `select o.id, o.slug, o.name,
            exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_key = 'org.manage_members') as "isAdmin"
       from organization_members m
       join organizations o on o.id = m.organization_id
      where m.user_id = $1 and m.status = 'active' and o.deleted_at is null
      order by o.name`,
    [user.id],
  );
  return { reporter: { userId: user.id, userName: user.fullName, via: "session", orgs, tokenRejected: sentToken } };
}
