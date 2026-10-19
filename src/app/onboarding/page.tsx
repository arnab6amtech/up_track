import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { CreateOrganizationForm } from "@/components/auth-forms";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Create an organization — UpTrack" };

export default function OnboardingPage() {
  return (
    <AuthCard
      title="Create your organization"
      subtitle="Your organization holds your projects and team. You can invite developers and SQA engineers next."
    >
      <Suspense>
        <Gate />
      </Suspense>
    </AuthCard>
  );
}

async function Gate() {
  await requireUser("/onboarding");
  return <CreateOrganizationForm />;
}
