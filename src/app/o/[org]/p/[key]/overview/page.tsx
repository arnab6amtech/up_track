import Link from "next/link";
import { Suspense } from "react";
import { groupHref, loadProjectNav, ProjectNavChips, ProjectSidebar } from "@/components/project-sidebar";
import type { PlatformGroup } from "@/lib/platform-status";
import { getOrgContext } from "@/server/access";

export const metadata = { title: "Overview — UpTrack" };

export default function ProjectOverviewPage({ params }: PageProps<"/o/[org]/p/[key]/overview">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
      <Overview params={params} />
    </Suspense>
  );
}

const place = { page: "overview" as const };
const doneCount = (g: PlatformGroup) => g.total - g.open;
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** How much of a platform's bugs are done: one bar, one colour, with the numbers written beside it. */
function DoneMeter({ group }: { group: PlatformGroup }) {
  const done = doneCount(group);
  const share = percent(done, group.total);
  return (
    <div className="space-y-1.5" title={`${done} of ${group.total} ${group.total === 1 ? "bug" : "bugs"} done`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">
          <span className="font-medium text-foreground">{done}</span> of {group.total} done
        </span>
        <span className="tabular-nums text-muted">{share}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={`${group.name}: bugs done`}
        aria-valuemin={0}
        aria-valuemax={group.total}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

async function Overview({ params }: Pick<PageProps<"/o/[org]/p/[key]/overview">, "params">) {
  const { org, key } = await params;
  const [ctx, nav] = await Promise.all([getOrgContext(org), loadProjectNav(org, key)]);
  const [all, ...platforms] = nav.groups;
  const statuses = all.statuses;

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <ProjectSidebar org={org} projectKey={key} place={place} />
      <div className="min-w-0 space-y-8">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted">
              <Link href={`/o/${org}`} className="hover:underline">
                {ctx.org.name}
              </Link>{" "}
              / <span className="font-mono">{nav.current.key}</span>
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-0.5 text-sm text-muted">
              {platforms.length ? "How many bugs each platform has, and where they stand." : `Where ${nav.current.name}'s bugs stand.`}
            </p>
          </div>
          <ProjectNavChips org={org} projectKey={key} place={place} />
        </div>

        {/* The whole project: every bug, then each status. */}
        <section className="space-y-3" aria-labelledby="totals">
          <h2 id="totals" className="text-sm font-semibold">
            {platforms.length ? "All platforms" : "All bugs"}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <li>
              <Link href={groupHref(nav.base, "all")} className="block h-full rounded-xl border border-line bg-surface p-4 transition hover:border-neutral-400">
                <p className="text-xs font-medium text-muted">Total</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{all.total}</p>
                <p className="mt-0.5 text-xs text-muted">{all.open} not done</p>
              </Link>
            </li>
            {statuses.map((s) => (
              <li key={s.id}>
                <Link href={groupHref(nav.base, "all", s.id)} className="block h-full rounded-xl border border-line bg-surface p-4 transition hover:border-neutral-400">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className="size-2 rounded-full" style={{ background: s.color ?? "#94a3b8" }} aria-hidden />
                    {s.name}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{s.count}</p>
                  <p className="mt-0.5 text-xs text-muted">{percent(s.count, all.total)}% of bugs</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {platforms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-6 text-sm text-muted">
            This project has no platforms, so its bugs aren&apos;t split by platform.
            {nav.canManage && (
              <>
                {" "}
                <Link href={`${nav.base}/settings#platforms`} className="font-medium text-foreground underline underline-offset-2">
                  Add platforms
                </Link>{" "}
                such as Admin panel or User app to see each one here.
              </>
            )}
          </p>
        ) : (
          <>
            {/* One card per platform: its total, how much is done, and each status. */}
            <section className="space-y-3" aria-labelledby="by-platform">
              <h2 id="by-platform" className="text-sm font-semibold">
                By platform
              </h2>
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {platforms.map((g) => (
                  <li key={g.key} className="space-y-4 rounded-xl border border-line bg-surface p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={groupHref(nav.base, g.key)} className="block truncate font-semibold hover:underline">
                          {g.name}
                          {g.removed && <span className="font-normal text-muted"> (removed)</span>}
                        </Link>
                        <p className="text-xs text-muted">{g.open} not done</p>
                      </div>
                      <p className="text-right">
                        <span className="block text-2xl font-semibold tabular-nums leading-none">{g.total}</span>
                        <span className="text-xs text-muted">{g.total === 1 ? "bug" : "bugs"}</span>
                      </p>
                    </div>
                    <DoneMeter group={g} />
                    <ul className="divide-y divide-line border-t border-line">
                      {g.statuses.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={groupHref(nav.base, g.key, s.id)}
                            className={`-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2 ${s.count ? "" : "text-muted"}`}
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color ?? "#94a3b8", opacity: s.count ? 1 : 0.4 }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="tabular-nums">{s.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

          </>
        )}
      </div>
    </div>
  );
}
