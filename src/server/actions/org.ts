"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, getOrgContext } from "../access";
import { publicOrigin } from "@/lib/origin";
import { changeMemberRole, createInvitation, removeMember, revokeInvitation, UserError } from "../orgs";
import { createProject } from "../projects";
import { createToken, revokeToken } from "../tokens";
import { attempt, text, type ActionState } from "./result";

export async function createProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
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

export async function inviteMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await getOrgContext(text(form, "org"));
    assertCan(ctx.permissions, "org.manage_members");
    const email = z.string().trim().toLowerCase().email().safeParse(text(form, "email"));
    if (!email.success) throw new UserError("Enter a valid email address.");
    const token = await createInvitation(ctx.org.id, ctx.user.id, email.data, text(form, "roleId"));
    refresh();
    return {
      success: `Invitation created for ${email.data}.`,
      data: { link: `${await publicOrigin()}/invite/${token}`, email: email.data },
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
