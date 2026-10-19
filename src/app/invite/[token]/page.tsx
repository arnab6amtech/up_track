import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { AcceptInvitationForm } from "@/components/accept-invitation-form";
import { getCurrentUser } from "@/server/auth/session";
import { findInvitation } from "@/server/orgs";

export const metadata = { title: "Invitation — UpTrack" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<AuthCard title="Invitation">{null}</AuthCard>}>
      <Invitation params={params} />
    </Suspense>
  );
}

async function Invitation({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const [invite, user] = await Promise.all([findInvitation(token), getCurrentUser()]);
  if (!invite || invite.state !== "open") {
    return (
      <AuthCard title="This invitation can't be used">
        <p className="text-sm text-muted">
          {invite?.state === "expired" ? "It has expired." : "It was already used, cancelled or never existed."} Ask whoever invited
          you to send a new one.
        </p>
      </AuthCard>
    );
  }
  const here = `/invite/${token}`;
  return (
    <AuthCard
      title={`Join ${invite.orgName}`}
      subtitle={
        <>
          You&apos;ve been invited as <span className="font-medium text-foreground">{invite.roleName}</span> ({invite.email}).
        </>
      }
    >
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
        </div>
      ) : user.email.toLowerCase() !== invite.email.toLowerCase() ? (
        <p className="text-sm text-muted">
          You&apos;re signed in as {user.email}, but this invitation is for {invite.email}. Sign out and sign in with that email to
          accept it.
        </p>
      ) : (
        <AcceptInvitationForm token={token} />
      )}
    </AuthCard>
  );
}
