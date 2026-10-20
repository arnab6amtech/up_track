import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listMyOrganizations } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";

/** Sends people where they belong: sign in, set up their account, or their organization (else personal workspace). */
export default function Home() {
  return (
    <Suspense>
      <Route />
    </Suspense>
  );
}

async function Route(): Promise<null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Team organizations come first, the personal workspace last.
  const orgs = await listMyOrganizations(user.id);
  redirect(orgs.length ? `/o/${orgs[0].slug}` : "/onboarding");
}
