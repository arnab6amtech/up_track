import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { AcceptInvitationForm, DeclineInvitationForm } from "@/components/accept-invitation-form";
import { getCurrentUser } from "@/server/auth/session";
import { findInvitation } from "@/server/orgs";

export const metadata = { title: "Invitation — UpTrack" };

export default function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<AuthCard title="Invitation">{null}</AuthCard>}>
      <Invitation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UNUSABLE: Record<string, string> = {
  expired: "It has expired.",
  declined: "It was declined.",
  used: "It was already used or cancelled.",
};

async function Invitation({ params, searchParams }: Pick<PageProps<"/invite/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const declining = (await searchParams).answer === "decline";
  const [invite, user] = await Promise.all([findInvitation(token), getCurrentUser()]);
  if (!invite || invite.state !== "open") {
    return (
      <AuthCard title="This invitation can't be used">
        <p className="text-sm text-muted">
          {(invite && UNUSABLE[invite.state]) ?? "It doesn't exist."} Ask whoever invited you to send a new one.
        </p>
      </AuthCard>
    );
  }
  const here = `/invite/${token}`;
  const subtitle = (
    <>
      {invite.inviterName ? `${invite.inviterName} invited you` : "You've been invited"} to join as{" "}
      <span className="font-medium text-foreground">{invite.roleName}</span> ({invite.email}).
    </>
  );

  if (declining) {
    return (
      <AuthCard title={`Join ${invite.orgName}?`} subtitle={subtitle}>
        <div className="space-y-3">
          <DeclineInvitationForm token={token} orgName={invite.orgName} confirm />
          <Link href={here} className="block text-center text-sm text-muted underline underline-offset-2 hover:text-foreground">
            I&apos;d rather accept it
          </Link>
        </div>
      </AuthCard>
    );
  }

  const decline = <DeclineInvitationForm token={token} orgName={invite.orgName} confirm={false} />;
  return (
    <AuthCard title={`Join ${invite.orgName}`} subtitle={subtitle}>
      {!user ? (
        <div className="space-y-3">
          <Link
            href={`/signup?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}
            className="block rounded-md bg-accent px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create an account to join
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(here)}`}
            className="block rounded-md border border-line px-4 py-2.5 text-center text-sm font-medium hover:border-accent"
          >
            I already have an account
          </Link>
          {decline}
        </div>
      ) : user.email.toLowerCase() !== invite.email.toLowerCase() ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            You&apos;re signed in as {user.email}, but this invitation is for {invite.email}. Sign out and sign in with that email to
            accept it.
          </p>
          {decline}
        </div>
      ) : (
        <div className="space-y-3">
          <AcceptInvitationForm token={token} />
          {decline}
        </div>
      )}
    </AuthCard>
  );
}
