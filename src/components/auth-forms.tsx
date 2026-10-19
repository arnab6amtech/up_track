"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createOrganizationAction, signIn, signUp } from "@/server/actions/auth";
import type { ActionState } from "@/server/actions/result";
import { Field, FormMessage, inputClass, SubmitButton } from "./form";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Signing in…" className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        New to UpTrack?{" "}
        <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next, email }: { next: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Your name" htmlFor="fullName">
        <input id="fullName" name="fullName" autoComplete="name" required autoFocus className={inputClass} />
      </Field>
      <Field label="Work email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Creating your account…" className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function CreateOrganizationForm() {
  const [state, action] = useActionState<ActionState, FormData>(createOrganizationAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Organization name" htmlFor="name" hint="Your company or team, e.g. Null Void Studio.">
        <input id="name" name="name" required maxLength={200} autoFocus className={inputClass} />
      </Field>
      <Field label="Address" htmlFor="slug" hint="Used in links. Leave empty to use the name.">
        <input id="slug" name="slug" maxLength={63} pattern="[a-z0-9-]*" placeholder="null-void-studio" className={inputClass} />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Creating…" className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        Create organization
      </SubmitButton>
    </form>
  );
}
