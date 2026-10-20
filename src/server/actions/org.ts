"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, getOrgContext } from "../access";
import { publicOrigin } from "@/lib/origin";
import { invitationMail, sendMail } from "../mail";
import { changeMemberRole, createInvitation, INVITE_ROLES, markInvitationEmailed, removeMember, revokeInvitation, UserError, type InviteRole } from "../orgs";
import { createProject } from "../projects";
import { createToken, revokeToken } from "../tokens";
import { attempt, text, type ActionState } from "./result";

export async function createProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    if (ctx.org.kind === "personal") throw new UserError("Personal accounts can't create projects. Create an organization to work on projects with a team.");
    if (!ctx.isAdmin) assertCan(ctx.permissions, "org.create_projects");
    const name = text(form, "name");
    const key = text(form, "key").toUpperCase();
    if (!name) throw new UserError("Give the project a name.");
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      throw new UserError("The key needs 2–10 letters or digits and must start with a letter, like UPT.");
    }
    const created = await createProject(ctx.org.id, ctx.user.id, {
      name,
      key,
      description: text(form, "description"),
      firstVersion: text(form, "firstVersion"),
    });
    redirect(`/o/${ctx.org.slug}/p/${created}`);
  });
}

export interface InviteResult {
  email: string;
  /** The link, to copy when the email couldn't be sent. */
  link?: string;
  emailed?: boolean;
  error?: string;
}

/**
 * Invites one or more people (separated by commas, spaces or new lines) as Developer, QA or Admin, to the
 * chosen projects. Each gets an email with Accept and Decline; if email isn't set up, the inviter gets links.
 */
export async function inviteMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    assertCan(ctx.permissions, "org.manage_members");
    if (ctx.org.kind !== "organization") throw new UserError("Personal workspaces can't have members.");
    const emails = [...new Set(text(form, "emails").toLowerCase().split(/[\s,;]+/).filter(Boolean))];
    if (emails.length === 0) throw new UserError("Enter at least one email address.");
    if (emails.length > 20) throw new UserError("Invite up to 20 people at a time.");
    const invalid = emails.find((e) => !z.email().safeParse(e).success);
    if (invalid) throw new UserError(`"${invalid}" isn't a valid email address.`);

    const role = text(form, "role") as InviteRole;
    if (!(role in INVITE_ROLES)) throw new UserError("Choose Developer, QA or Admin.");
    if (role === "admin" && ctx.role.key !== "owner" && ctx.role.key !== "admin") throw new UserError("Only owners and admins can invite admins.");
    // Every project (null) unless the inviter narrowed it down.
    let projectIds: string[] | null = null;
    if (role !== "admin" && text(form, "projects") === "some") {
      projectIds = [...new Set(form.getAll("projectIds").map(String))];
      if (projectIds.length === 0) throw new UserError("Pick at least one project, or invite them to all projects.");
    }

    const origin = await publicOrigin();
    const results: InviteResult[] = [];
    for (const email of emails) {
      try {
        const { id, token } = await createInvitation(ctx.org.id, ctx.user.id, email, role, projectIds);
        const link = `${origin}/invite/${token}`;
        let emailed = false;
        try {
          emailed = await sendMail(invitationMail({ to: email, orgName: ctx.org.name, inviterName: ctx.user.fullName, roleName: INVITE_ROLES[role].label, link }));
          if (emailed) await markInvitationEmailed(ctx.org.id, id);
        } catch (err) {
          console.error(`[mail] couldn't send the invitation to ${email}`, err);
        }
        results.push({ email, emailed, link: emailed ? undefined : link });
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        results.push({ email, error: err.message });
      }
    }
    refresh();
    const sent = results.filter((r) => !r.error).length;
    return {
      success: sent ? `Invited ${sent} ${sent === 1 ? "person" : "people"}.` : undefined,
      error: sent ? undefined : results[0]?.error,
      data: { results: JSON.stringify(results), sentAt: String(Date.now()) },
    };
  });
}

export async function changeMemberRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    assertCan(ctx.permissions, "org.manage_members");
    await changeMemberRole(ctx.org.id, ctx.user.id, ctx.role.key === "owner", text(form, "userId"), text(form, "roleId"));
    refresh();
    return { success: "Role updated." };
  });
}

export async function removeMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    assertCan(ctx.permissions, "org.manage_members");
    if (text(form, "userId") === ctx.user.id) throw new UserError("You can't remove yourself.");
    await removeMember(ctx.org.id, ctx.user.id, ctx.role.key === "owner", text(form, "userId"));
    refresh();
  });
}

export async function revokeInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    assertCan(ctx.permissions, "org.manage_members");
    await revokeInvitation(ctx.org.id, text(form, "invitationId"));
    refresh();
  });
}

export async function createTokenAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    const name = text(form, "name");
    if (!name) throw new UserError("Name the token, e.g. “Laptop extension”.");
    const days = text(form, "expires");
    const token = await createToken(ctx.org.id, ctx.user.id, name, days ? Number(days) : null);
    refresh();
    return { data: { token, name } };
  });
}

export async function revokeTokenAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    await revokeToken(ctx.org.id, ctx.user.id, text(form, "tokenId"));
    refresh();
  });
}
