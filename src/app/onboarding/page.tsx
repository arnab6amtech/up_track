import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { AccountSetupForm } from "@/components/auth-forms";
import { listMyOrganizations } from "@/server/access";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Set up your account — UpTrack" };

/**
 * For signed-in people without a workspace (they joined through an invitation and later left, or sign-up
 * couldn't finish), and for anyone adding an organization from the switcher.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<AuthCard title="Set up your account">{null}</AuthCard>}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  const user = await requireUser("/onboarding");
  const orgs = await listMyOrganizations(user.id);
  const hasPersonal = orgs.some((o) => o.kind === "personal");
  if (orgs.length > 0) {
    return (
      <AuthCard title="Create an organization" subtitle="You'll be its owner: create projects and invite developers and QA.">
        <AccountSetupForm allowPersonal={!hasPersonal} initial="organization" />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set up your account" subtitle="Work with a team in an organization, or on your own with a Personal account.">
      <AccountSetupForm allowPersonal initial="organization" />
    </AuthCard>
  );
}
