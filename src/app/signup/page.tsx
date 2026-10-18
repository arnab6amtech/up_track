import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Create your account — UpTrack" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard title="Create your account" subtitle="Track bugs across your team's projects and versions.">
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/");
  return <SignUpForm next={String(params.next ?? "")} email={String(params.email ?? "")} />;
}
