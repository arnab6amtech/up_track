import Link from "next/link";
import { listMyOrganizations } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { AppNav } from "./app-nav";

export async function AppHeaderContent() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground">
        Sign in
      </Link>
    );
  }
  const orgs = await listMyOrganizations(user.id);
  return <AppNav user={{ fullName: user.fullName, email: user.email }} orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))} />;
}

/** The floating agent guide is only useful to signed-in people. */
export async function SignedInOnly({ children }: { children: React.ReactNode }) {
  return (await getCurrentUser()) ? children : null;
}
