"use server";

import { refresh } from "next/cache";
import { getOrgContext, getProjectAccess } from "../access";
import { UserError } from "../orgs";
import {
  addSeverity,
  addStatus,
  moveSeverity,
  moveStatus,
  removeSeverity,
  removeStatus,
  setDefaultSeverity,
  setDefaultStatus,
  updateSeverity,
  updateStatus,
} from "../workflow";
import { attempt, text, type ActionState } from "./result";

/**
 * A project's status and severity settings. Everyone on the project may change them (and admins, who
 * see every project); each project keeps its own lists.
 */
async function member(form: FormData) {
  const org = text(form, "org");
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, text(form, "project"))]);
  return { orgId: ctx.org.id, projectId: access.project.id };
}

const direction = (form: FormData) => (text(form, "direction") === "up" ? "up" : "down");

export async function addStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { orgId, projectId } = await member(form);
    await addStatus(orgId, projectId, { name: text(form, "name"), color: text(form, "color"), category: text(form, "category") });
    refresh();
    return { success: "Status added.", data: { at: String(Date.now()) } };
  });
}

export async function updateStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { orgId, projectId } = await member(form);
    await updateStatus(orgId, projectId, text(form, "id"), { name: text(form, "name"), color: text(form, "color"), category: text(form, "category") });
    refresh();
    return { success: "Saved." };
  });
}

export async function addSeverityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { orgId, projectId } = await member(form);
    await addSeverity(orgId, projectId, { name: text(form, "name"), color: text(form, "color") });
    refresh();
    return { success: "Severity level added.", data: { at: String(Date.now()) } };
  });
}

export async function updateSeverityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { orgId, projectId } = await member(form);
    await updateSeverity(orgId, projectId, text(form, "id"), { name: text(form, "name"), color: text(form, "color") });
    refresh();
    return { success: "Saved." };
  });
}

/** Make default, move up or down, or remove: one action for the row buttons of either list. */
export async function workflowRowAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { orgId, projectId } = await member(form);
    const id = text(form, "id");
    const list = text(form, "list");
    const op = text(form, "op");
    if (list !== "status" && list !== "severity") throw new UserError("Unknown list.");
    const status = list === "status";
    if (op === "default") await (status ? setDefaultStatus : setDefaultSeverity)(orgId, projectId, id);
    else if (op === "move") await (status ? moveStatus : moveSeverity)(orgId, projectId, id, direction(form));
    else if (op === "remove") await (status ? removeStatus : removeSeverity)(orgId, projectId, id);
    else throw new UserError("Unknown change.");
    refresh();
    return {};
  });
}
