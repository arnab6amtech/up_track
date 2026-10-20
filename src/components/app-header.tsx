import Link from "next/link";
import { listMyOrganizations } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { AppNav } from "./app-nav";

export async function AppHeaderContent() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
        {/* The homepage's sections. */}
        {[
          ["Features", "/#features"],
          ["How it works", "/#how-it-works"],
          ["FAQ", "/#faq"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="hidden rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:text-foreground md:block">
            {label}
          </Link>
        ))}
        <Link href="/login" className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:text-foreground">
          Sign in
        </Link>
        <Link href="/signup" className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Create account
        </Link>
      </nav>
    );
  }
  const orgs = await listMyOrganizations(user.id);
  return (
    <AppNav
      user={{ fullName: user.fullName, email: user.email }}
      orgs={orgs.map((o) => ({ slug: o.slug, name: o.name, kind: o.kind }))}
      accountType={orgs.some((o) => o.kind === "organization") ? "organization" : "personal"}
    />
  );
}

/** The floating agent guide is only useful to signed-in people. */
export async function SignedInOnly({ children }: { children: React.ReactNode }) {
  return (await getCurrentUser()) ? children : null;
}
