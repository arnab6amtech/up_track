"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/crypto";
import { endSession, requireUser, startSession } from "../auth/session";
import { getDb, one } from "../db";
import { acceptInvitation, createOrganization, isUniqueViolation, slugify, UserError } from "../orgs";
import { attempt, text, type ActionState } from "./result";

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
function safeNext(value: string): string | null {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : null;
}

const signupsOpen = () => process.env.ALLOW_SIGNUPS?.trim().toLowerCase() !== "false";

// A real scrypt hash of a random password, checked when an email isn't found so both paths take as long.
let dummyHash: Promise<string> | null = null;

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const next = safeNext(text(form, "next")) ?? "/";
  return attempt(async () => {
    const email = text(form, "email").toLowerCase();
    const password = String(form.get("password") ?? "");
    const db = await getDb();
    const user = await one<{ id: string; password_hash: string | null; status: string }>(
      db,
      "select id, password_hash, status from users where email = $1 and deleted_at is null",
      [email],
    );
    dummyHash ??= hashPassword(crypto.randomUUID());
    const valid = await verifyPassword(password, user?.password_hash ?? (await dummyHash));
    if (!user || !valid || user.status !== "active") throw new UserError("That email and password don't match an account.");
    await startSession(user.id);
    redirect(next);
  });
}

const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const next = safeNext(text(form, "next"));
  return attempt(async () => {
    if (!signupsOpen() && !next?.startsWith("/invite/")) {
      throw new UserError("Sign-ups are closed. Ask an admin to invite you.");
    }
    const parsed = signupSchema.safeParse({
      fullName: text(form, "fullName"),
      email: text(form, "email"),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const db = await getDb();
    let userId: string;
    try {
      const row = await one<{ id: string }>(db, "insert into users (email, full_name, password_hash) values ($1, $2, $3) returning id", [
        parsed.data.email,
        parsed.data.fullName,
        await hashPassword(parsed.data.password),
      ]);
      userId = row!.id;
    } catch (err) {
      if (isUniqueViolation(err)) throw new UserError("There's already an account with that email. Sign in instead.");
      throw err;
    }
    await startSession(userId);
    redirect(next ?? "/onboarding");
  });
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

export async function createOrganizationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const user = await requireUser("/onboarding");
    const name = text(form, "name");
    const slug = slugify(text(form, "slug") || name);
    if (!name) throw new UserError("Give your organization a name.");
    if (slug.length < 2) throw new UserError("The address needs at least two letters or numbers.");
    const created = await createOrganization(user.id, name, slug);
    redirect(`/o/${created}`);
  });
}

export async function acceptInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = text(form, "token");
  return attempt(async () => {
    const user = await requireUser(`/invite/${token}`);
    const slug = await acceptInvitation(token, user);
    redirect(`/o/${slug}`);
  });
}
