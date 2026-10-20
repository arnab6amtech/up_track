"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "../auth/crypto";
import { verifyCredentials } from "../auth/credentials";
import { endSession, requireUser, startSession } from "../auth/session";
import { getDb, one } from "../db";
import { acceptInvitation, createOrganization, createPersonalWorkspace, declineInvitation, isUniqueViolation, slugify, UserError } from "../orgs";
import { attempt, text, type ActionState } from "./result";

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
function safeNext(value: string): string | null {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : null;
}

const signupsOpen = () => process.env.ALLOW_SIGNUPS?.trim().toLowerCase() !== "false";

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const next = safeNext(text(form, "next")) ?? "/";
  return attempt(async () => {
    const userId = await verifyCredentials(text(form, "email"), String(form.get("password") ?? ""));
    if (!userId) throw new UserError("That email and password don't match an account.");
    await startSession(userId);
    redirect(next);
  });
}

/**
 * What a new account starts with. "personal": a private workspace with one project, to report bugs on
 * your own. "organization": an organization you own, to create projects and invite developers and QA.
 */
const accountSchema = z.discriminatedUnion("accountType", [
  z.object({ accountType: z.literal("personal") }),
  z.object({
    accountType: z.literal("organization"),
    orgName: z.string().trim().min(1, "Enter your organization's name.").max(200, "Use a shorter organization name."),
  }),
]);

function parseAccount(form: FormData) {
  const parsed = accountSchema.safeParse({ accountType: text(form, "accountType"), orgName: text(form, "orgName") });
  if (!parsed.success) {
    throw new UserError(parsed.error.issues[0].path[0] === "accountType" ? "Choose a Personal or an Organization account." : parsed.error.issues[0].message);
  }
  return parsed.data;
}

/** Creates the account's workspace and returns where to go next. */
async function setUpAccount(user: { id: string; fullName: string }, account: z.infer<typeof accountSchema>): Promise<string> {
  if (account.accountType === "personal") return `/o/${await createPersonalWorkspace(user.id, user.fullName)}`;
  return `/o/${await createOrganization(user.id, account.orgName, slugify(account.orgName) || "org", { fallbackSlug: true })}`;
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
    // People joining through an invitation get their organization from it; everyone else picks a type.
    const joining = next?.startsWith("/invite/") ?? false;
    const account = joining ? null : parseAccount(form);
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
    if (!account) redirect(next ?? "/");
    let destination = "/onboarding";
    try {
      destination = await setUpAccount({ id: userId, fullName: parsed.data.fullName }, account);
    } catch (err) {
      // The account exists either way; onboarding lets them try the workspace again.
      console.error("[signup] couldn't set up the workspace", err);
    }
    redirect(destination);
  });
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

/** Onboarding: sets up a Personal workspace or a new organization for someone already signed in. */
export async function setUpAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const user = await requireUser("/onboarding");
    const account = parseAccount(form);
    if (account.accountType === "organization" && text(form, "slug")) {
      const slug = slugify(text(form, "slug"));
      if (slug.length < 2) throw new UserError("The address needs at least two letters or numbers.");
      redirect(`/o/${await createOrganization(user.id, account.orgName, slug)}`);
    }
    redirect(await setUpAccount(user, account));
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

export async function declineInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const invite = await declineInvitation(text(form, "token"));
    return { success: `You declined the invitation to ${invite.orgName}.` };
  });
}
