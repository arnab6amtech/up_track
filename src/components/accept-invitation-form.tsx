"use client";

import { useActionState } from "react";
import { acceptInvitationAction, declineInvitationAction } from "@/server/actions/auth";
import type { ActionState } from "@/server/actions/result";
import { FormMessage, SubmitButton } from "./form";

const primary = "w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50";
const secondary = "w-full rounded-md border border-line px-4 py-2.5 text-sm font-medium hover:border-accent disabled:opacity-50";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState, FormData>(acceptInvitationAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Joining…" className={primary}>
        Accept invitation
      </SubmitButton>
    </form>
  );
}

/**
 * Turns the invitation down. Anyone holding the link can, without an account. `confirm` is for the email's
 * Decline button: it lands here and asks once more, since links in emails get opened by scanners too.
 */
export function DeclineInvitationForm({ token, orgName, confirm }: { token: string; orgName: string; confirm: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(declineInvitationAction, {});
  if (state.success) {
    return (
      <p role="status" className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
        {state.success} {orgName} has been told. You can close this page.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {confirm && <p className="text-sm">Decline the invitation to join {orgName}?</p>}
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Declining…" className={confirm ? primary : secondary}>
        {confirm ? "Yes, decline" : "Decline"}
      </SubmitButton>
    </form>
  );
}
