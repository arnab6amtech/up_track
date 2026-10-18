import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, one } from "../db";
import { newToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "uptrack_session";
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
}

/** Starts a session for the user and sets the cookie. Call from a server action or route handler. */
export async function startSession(userId: string): Promise<void> {
  const token = newToken("ses");
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const db = await getDb();
  await db.query(
    "insert into sessions (user_id, token_hash, user_agent, ip_address, expires_at) values ($1, $2, $3, $4::inet, $5)",
    [userId, sha256(token), h.get("user-agent")?.slice(0, 500) ?? null, ip && /^[\d.:a-f]+$/i.test(ip) ? ip : null, expires],
  );
  await db.query("update users set last_login_at = now() where id = $1", [userId]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await getDb()).query("delete from sessions where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Looked up once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const row = await one<{ id: string; email: string; full_name: string }>(
    db,
    `select u.id, u.email, u.full_name
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.status = 'active' and u.deleted_at is null`,
    [sha256(token)],
  );
  if (!row) return null;
  // Record activity at most every 10 minutes rather than on every request (the database keeps the time).
  await db.query("update sessions set last_seen_at = now() where token_hash = $1 and last_seen_at < now() - interval '10 minutes'", [
    sha256(token),
  ]);
  return { id: row.id, email: row.email, fullName: row.full_name };
});

/** The signed-in user; sends everyone else to the sign-in page and back here afterwards. */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  return user;
}
