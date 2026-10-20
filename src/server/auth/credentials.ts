import "server-only";
import { getDb, one } from "../db";
import { hashPassword, verifyPassword } from "./crypto";

// A real scrypt hash of a random password, checked when an email isn't found so both paths take as long.
let dummyHash: Promise<string> | null = null;

/** The id of the active account with this email and password, or null. Used by the web app and the extension. */
export async function verifyCredentials(email: string, password: string): Promise<string | null> {
  const db = await getDb();
  const user = await one<{ id: string; password_hash: string | null; status: string }>(
    db,
    "select id, password_hash, status from users where email = $1 and deleted_at is null",
    [email.trim().toLowerCase()],
  );
  dummyHash ??= hashPassword(crypto.randomUUID());
  const valid = await verifyPassword(password, user?.password_hash ?? (await dummyHash));
  return user && valid && user.status === "active" ? user.id : null;
}
