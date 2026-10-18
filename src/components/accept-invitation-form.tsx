"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/server/actions/auth";
import type { ActionState } from "@/server/actions/result";
import { FormMessage, SubmitButton } from "./form";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState, FormData>(acceptInvitationAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Joining…" className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
