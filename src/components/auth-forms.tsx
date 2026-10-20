"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { setUpAccountAction, signIn, signUp } from "@/server/actions/auth";
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

type AccountType = "personal" | "organization";

const ACCOUNT_TYPES: { value: AccountType; title: string; text: string }[] = [
  { value: "organization", title: "Organization", text: "Create projects and invite your developers and QA team." },
  { value: "personal", title: "Personal", text: "Report and track bugs on your own, in one personal project." },
];

/** The Personal / Organization choice, and the organization's name when it's an organization. */
function AccountTypeFields({ initial = "organization", allowPersonal = true }: { initial?: AccountType; allowPersonal?: boolean }) {
  const [type, setType] = useState<AccountType>(allowPersonal ? initial : "organization");
  const choices = allowPersonal ? ACCOUNT_TYPES : ACCOUNT_TYPES.filter((t) => t.value === "organization");
  return (
    <>
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 block text-sm font-medium">Account type</legend>
        <div className={`grid gap-2 ${choices.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {choices.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/20 ${
                type === t.value ? "border-accent bg-surface-2" : "border-line hover:border-neutral-400"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-xs leading-snug text-muted">{t.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {type === "organization" && (
        <Field label="Organization name" htmlFor="orgName" hint="Your company or team. You'll be its owner.">
          <input id="orgName" name="orgName" required maxLength={200} placeholder="Null Void Studio" className={inputClass} />
        </Field>
      )}
    </>
  );
}

/** Sign-up. Someone arriving from an invitation joins that organization, so they don't pick an account type. */
export function SignUpForm({
  next,
  email,
  inviteOrg,
  accountType = "organization",
}: {
  next: string;
  email: string;
  inviteOrg: string | null;
  /** Which account type starts selected (from the homepage's plans). */
  accountType?: AccountType;
}) {
  const [state, action] = useActionState<ActionState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {inviteOrg ? (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          You&apos;ll join <span className="font-medium">{inviteOrg}</span> once your account is created.
        </p>
      ) : (
        <AccountTypeFields initial={accountType} />
      )}
      <Field label="Your name" htmlFor="fullName">
        <input id="fullName" name="fullName" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Email" htmlFor="email">
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

/**
 * Onboarding for someone signed in without a workspace (or adding an organization): a Personal workspace,
 * unless they already have one, or a new organization.
 */
export function AccountSetupForm({ allowPersonal, initial }: { allowPersonal: boolean; initial: AccountType }) {
  const [state, action] = useActionState<ActionState, FormData>(setUpAccountAction, {});
  return (
    <form action={action} className="space-y-4">
      <AccountTypeFields allowPersonal={allowPersonal} initial={initial} />
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Setting up…" className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
        Continue
      </SubmitButton>
    </form>
  );
}
