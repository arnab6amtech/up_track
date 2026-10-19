import "server-only";
import { unstable_rethrow } from "next/navigation";
import { PermissionError } from "../access";
import { UserError } from "../orgs";

export interface ActionState {
  error?: string;
  success?: string;
  /** Extra data for the page, e.g. a token that is shown once. */
  data?: Record<string, string>;
}

/**
 * Runs an action body and turns expected problems (bad input, missing permission) into a message for
 * the form. Redirects and unexpected errors pass through untouched.
 */
export async function attempt(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError || err instanceof PermissionError) return { error: err.message };
    console.error("[action]", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
