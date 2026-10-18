import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listMyOrganizations } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";

/** Sends people where they belong: sign in, create an organization, or their organization's projects. */
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
  const orgs = await listMyOrganizations(user.id);
  redirect(orgs.length ? `/o/${orgs[0].slug}` : "/onboarding");
}
