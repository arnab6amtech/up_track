import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { findInvitation } from "@/server/orgs";

export const metadata = { title: "Create your account — UpTrack" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard title="Create your account" subtitle="Report, track and fix bugs, on your own or with your team.">
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const next = String(params.next ?? "");
  // Coming from an invitation: they join its organization instead of choosing an account type.
  const inviteToken = next.match(/^\/invite\/([^/?#]+)$/)?.[1];
  const invite = inviteToken ? await findInvitation(inviteToken) : null;
  return (
    <SignUpForm
      next={next}
      email={String(params.email ?? "")}
      inviteOrg={invite?.state === "open" ? invite.orgName : null}
      accountType={params.type === "personal" ? "personal" : "organization"}
    />
  );
}
