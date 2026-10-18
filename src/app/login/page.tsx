import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Sign in — UpTrack" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard title="Sign in to UpTrack">
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const next = String((await searchParams).next ?? "/");
  if (await getCurrentUser()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  return <SignInForm next={next} />;
}
