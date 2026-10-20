import Link from "next/link";
import { cache } from "react";
import { groupByPlatform, type PlatformGroup } from "@/lib/platform-status";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { countByPlatformAndStatus, listStatuses } from "@/server/bugs";
import { listPlatforms, listProjects, listVersions } from "@/server/projects";
import { PlatformTree, type TreeGroup } from "./platform-tree";
import { ProjectSwitcher } from "./project-switcher";

/** Where the person is: the bug list (with its platform and status filters) or the overview. */
export interface NavPlace {
  page: "bugs" | "overview";
  /** The listed platform: an id, "none", or "" for all. */
  platform?: string;
  /** The status filter: a status id, "open", "done" or "all". */
  status?: string;
}

/** Everything the project's navigation shows, loaded once per request however many parts use it. */
export const loadProjectNav = cache(async (org: string, key: string) => {
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  const { project, permissions } = access;
  const [projects, platforms, statuses, counts, versions] = await Promise.all([
    listProjects(ctx.org.id, ctx.user.id, ctx.isAdmin),
    listPlatforms(ctx.org.id, project.id),
    listStatuses(ctx.org.id, project.id),
    countByPlatformAndStatus(ctx.org.id, project.id),
    listVersions(ctx.org.id, project.id),
  ]);
  const base = `/o/${org}/p/${project.key}`;
  const groups = groupByPlatform(platforms, statuses, counts);
  const toSwitcher = (p: { key: string; name: string; openBugs: number }) => ({ key: p.key, name: p.name, openBugs: p.openBugs });
  return {
    base,
    groups,
    current: toSwitcher(projects.find((p) => p.id === project.id) ?? { key: project.key, name: project.name, openBugs: groups[0].open }),
    projects: projects.filter((p) => p.status === "active" || p.id === project.id).map(toSwitcher),
    canReport: permissions.has("bug.create") && versions.length > 0,
    /** Platforms, features and the team are for project managers. */
    canManage: permissions.has("project.manage"),
  };
});

/** The bug list for one platform group, with every status or one of them. */
export function groupHref(base: string, groupKey: string, status = "all") {
  const qs = new URLSearchParams();
  if (groupKey !== "all") qs.set("platform", groupKey);
  qs.set("status", status);
  return `${base}?${qs}`;
}

function toTree(base: string, groups: PlatformGroup[], place: NavPlace): TreeGroup[] {
  const listed = place.page === "bugs" ? place.platform || "all" : null;
  return groups.map((g) => ({
    key: g.key,
    name: g.name,
    total: g.total,
    removed: g.removed,
    href: groupHref(base, g.key),
    current: listed === g.key,
    active: listed === g.key && place.status === "all",
    statuses: g.statuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      count: s.count,
      href: groupHref(base, g.key, s.id),
      active: listed === g.key && place.status === s.id,
    })),
  }));
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden>
    <path fillRule="evenodd" d={d} clipRule="evenodd" />
  </svg>
);

const OVERVIEW_ICON = "M3 4.75A1.75 1.75 0 0 1 4.75 3h2.5A1.75 1.75 0 0 1 9 4.75v2.5A1.75 1.75 0 0 1 7.25 9h-2.5A1.75 1.75 0 0 1 3 7.25v-2.5Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .14.11.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5ZM11 4.75A1.75 1.75 0 0 1 12.75 3h2.5A1.75 1.75 0 0 1 17 4.75v2.5A1.75 1.75 0 0 1 15.25 9h-2.5A1.75 1.75 0 0 1 11 7.25v-2.5Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .14.11.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5ZM3 12.75A1.75 1.75 0 0 1 4.75 11h2.5A1.75 1.75 0 0 1 9 12.75v2.5A1.75 1.75 0 0 1 7.25 17h-2.5A1.75 1.75 0 0 1 3 15.25v-2.5Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .14.11.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5ZM11 12.75A1.75 1.75 0 0 1 12.75 11h2.5A1.75 1.75 0 0 1 17 12.75v2.5A1.75 1.75 0 0 1 15.25 17h-2.5A1.75 1.75 0 0 1 11 15.25v-2.5Zm1.75-.25a.25.25 0 0 0-.25.25v2.5c0 .14.11.25.25.25h2.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 0-.25-.25h-2.5Z";
const SETTINGS_ICON = "M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.295a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834a6.953 6.953 0 0 1-1.416.587l-.295 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.957 6.957 0 0 1-.587-1.416l-1.473-.295A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.03l1.25.834a6.957 6.957 0 0 1 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z";

const navItem = (active: boolean) =>
  `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
    active ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:bg-surface-2/60 hover:text-foreground"
  }`;

/**
 * The project's sidebar on wide screens: the project (and a switcher to the others), reporting, the
 * overview, and every platform with its bug statuses. Narrow screens get ProjectNavChips instead.
 */
export async function ProjectSidebar({ org, projectKey, place, reportPlatform }: { org: string; projectKey: string; place: NavPlace; reportPlatform?: string }) {
  const nav = await loadProjectNav(org, projectKey);
  const reportHref = `${nav.base}/bugs/new${reportPlatform ? `?platform=${reportPlatform}` : ""}`;
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-5 overflow-y-auto pb-4">
        <ProjectSwitcher org={org} current={nav.current} projects={nav.projects} />
        {nav.canReport && (
          <Link
            href={reportHref}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Report bug
          </Link>
        )}
        <Link href={`${nav.base}/overview`} aria-current={place.page === "overview" ? "page" : undefined} className={navItem(place.page === "overview")}>
          <Icon d={OVERVIEW_ICON} />
          Overview
        </Link>
        <div className="space-y-1">
          <p className="px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">{nav.groups.length > 1 ? "Platforms" : "Bugs"}</p>
          <PlatformTree groups={toTree(nav.base, nav.groups, place)} />
        </div>
        {/* Everyone on the project manages its statuses and severity there. */}
        <div className="border-t border-line pt-3">
          <Link href={`${nav.base}/settings`} className={navItem(false)}>
            <Icon d={SETTINGS_ICON} />
            Project settings
          </Link>
        </div>
      </div>
    </aside>
  );
}

const chip = (active: boolean) =>
  `shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
    active ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-neutral-400 hover:text-foreground"
  }`;

/** Narrow screens: the overview and the platforms as a row of chips. */
export async function ProjectNavChips({ org, projectKey, place }: { org: string; projectKey: string; place: NavPlace }) {
  const nav = await loadProjectNav(org, projectKey);
  const listed = place.page === "bugs" ? place.platform || "all" : null;
  return (
    <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden" aria-label="Project">
      <Link href={`${nav.base}/overview`} aria-current={place.page === "overview" ? "page" : undefined} className={chip(place.page === "overview")}>
        Overview
      </Link>
      {nav.groups.map((g) => (
        <Link key={g.key} href={groupHref(nav.base, g.key)} aria-current={listed === g.key ? "page" : undefined} className={chip(listed === g.key)}>
          {g.name} <span className="opacity-70">{g.total}</span>
        </Link>
      ))}
    </nav>
  );
}
