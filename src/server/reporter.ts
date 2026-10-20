import "server-only";
import { describeAccount, type AccountSummary } from "./access";
import { userForSession } from "./auth/session";
import { authenticateToken } from "./tokens";

export interface ReporterOrg {
  id: string;
  slug: string;
  name: string;
  kind: "organization" | "personal";
  /** Owners/admins can report to every project; everyone else only to their projects. */
  isAdmin: boolean;
}

/** Who is reporting from the browser extension, and to which organizations. */
export interface Reporter {
  userId: string;
  userName: string;
  email: string;
  /** "session": the extension's own sign-in. "token": an API token (scripts and agents). */
  via: "session" | "token";
  /** Organizations first, then the personal workspace. A token only reaches its own organization. */
  orgs: ReporterOrg[];
  account: AccountSummary["type"];
}

export type ReporterAuth = { reporter: Reporter } | { error: string; status: 401 };

const SIGN_IN = "Sign in to UpTrack in the extension to report bugs.";

/**
 * Authenticates a request from the browser extension by its "Authorization: Bearer" header: the session
 * token the extension got when the person signed in to it, or an API token. Cookies aren't used, so the
 * extension's sign-in is its own and works whatever the browser's cookie settings.
 */
export async function authenticateReporter(request: Request): Promise<ReporterAuth> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return { status: 401, error: SIGN_IN };

  if (bearer.startsWith("ses_")) {
    const user = await userForSession(bearer);
    if (!user) return { status: 401, error: "Your sign-in has expired. Sign in again." };
    const account = await describeAccount(user.id);
    const orgs = [...account.organizations, ...(account.personal ? [account.personal] : [])];
    return {
      reporter: {
        userId: user.id,
        userName: user.fullName,
        email: user.email,
        via: "session",
        orgs: orgs.map((o) => ({ id: o.id, slug: o.slug, name: o.name, kind: o.kind, isAdmin: o.isAdmin })),
        account: account.type,
      },
    };
  }

  const caller = await authenticateToken(request);
  if (!caller) return { status: 401, error: "That API token is revoked or expired." };
  const account = await describeAccount(caller.userId);
  const org = [...account.organizations, account.personal].find((o) => o?.id === caller.orgId);
  return {
    reporter: {
      userId: caller.userId,
      userName: caller.userName,
      email: "",
      via: "token",
      orgs: [{ id: caller.orgId, slug: caller.orgSlug, name: caller.orgName, kind: org?.kind ?? "organization", isAdmin: caller.isAdmin }],
      account: account.type,
    },
  };
}
