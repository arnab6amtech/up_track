"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/server/actions/auth";

interface Org {
  slug: string;
  name: string;
  kind: "organization" | "personal";
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const menuItem = "block w-full px-3 py-2 text-left text-sm hover:bg-surface-2";

/** Signed-in navigation. The current organization comes from the URL (/o/<slug>), else the first one. */
export function AppNav({
  user,
  orgs,
  accountType,
}: {
  user: { fullName: string; email: string };
  orgs: Org[];
  /** "organization" when they belong to any organization, else "personal" (the same rule the extension uses). */
  accountType: "organization" | "personal";
}) {
  const pathname = usePathname();
  const slug = pathname.match(/^\/o\/([^/]+)/)?.[1];
  const current = orgs.find((o) => o.slug === slug) ?? orgs[0];
  const [orgOpen, setOrgOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const orgRef = useDismiss(orgOpen, () => setOrgOpen(false));
  const userRef = useDismiss(userOpen, () => setUserOpen(false));

  const personal = current?.kind === "personal";
  const links: [string, string][] = current
    ? [
        [personal ? "My bugs" : "Projects", `/o/${current.slug}`],
        ["Sheets", "/sheets"],
        // A personal workspace has no members to manage.
        ...(personal ? [] : ([["Members", `/o/${current.slug}/settings/members`]] as [string, string][])),
        ["Extension", "/extension"],
        ["Connect agent", "/connect"],
      ]
    : [["Sheets", "/sheets"]];
  const isActive = (href: string) =>
    href === `/o/${current?.slug}` ? pathname === href || pathname.startsWith(`${href}/p/`) || pathname.startsWith(`${href}/projects`) : pathname.startsWith(href);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {current && (
        <div ref={orgRef} className="relative">
          <button
            type="button"
            onClick={() => setOrgOpen((o) => !o)}
            aria-expanded={orgOpen}
            className="max-w-48 truncate rounded-md border border-line px-2.5 py-1.5 text-xs font-medium hover:border-accent"
          >
            {current.name}
          </button>
          {orgOpen && (
            <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
              {orgs.map((o) => (
                <Link
                  key={o.slug}
                  href={`/o/${o.slug}`}
                  onClick={() => setOrgOpen(false)}
                  className={`${menuItem} flex items-center justify-between gap-2 ${o.slug === current.slug ? "font-medium" : ""}`}
                >
                  <span className="truncate">{o.name}</span>
                  {o.kind === "personal" && <span className="shrink-0 text-xs font-normal text-muted">Just you</span>}
                </Link>
              ))}
              <div className="my-1 border-t border-line" />
              <Link href="/onboarding" onClick={() => setOrgOpen(false)} className={menuItem}>
                New organization
              </Link>
            </div>
          )}
        </div>
      )}

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Main">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              isActive(href) ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div ref={userRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setUserOpen((o) => !o)}
          aria-expanded={userOpen}
          title={user.email}
          className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold hover:ring-2 hover:ring-line"
        >
          {user.fullName
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </button>
        {userOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-1 text-xs text-muted">{accountType === "organization" ? "Organization account" : "Personal account"}</p>
            </div>
            {current && (
              <Link href={`/o/${current.slug}/settings/tokens`} onClick={() => setUserOpen(false)} className={menuItem}>
                API tokens
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className={menuItem}>
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
