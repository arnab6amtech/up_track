import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LocalTime } from "@/components/local-time";
import { PriorityBadge, StatusPill } from "@/components/tracker-badges";
import { getOrgContext } from "@/server/access";
import { listAssignedOpenBugs } from "@/server/bugs";
import { listProjects } from "@/server/projects";

export default function OrgHome({ params }: PageProps<"/o/[org]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-2" />}>
      <Dashboard params={params} />
    </Suspense>
  );
}

async function Dashboard({ params }: Pick<PageProps<"/o/[org]">, "params">) {
  const ctx = await getOrgContext((await params).org);
  const [projects, mine] = await Promise.all([
    listProjects(ctx.org.id, ctx.user.id, ctx.isAdmin),
    listAssignedOpenBugs(ctx.org.id, ctx.user.id),
  ]);
  // A personal workspace has one project, so its home is that project's bugs.
  if (ctx.org.kind === "personal" && projects.length === 1) redirect(`/o/${ctx.org.slug}/p/${projects[0].key}`);
  const canCreate = ctx.org.kind === "organization" && (ctx.isAdmin || ctx.permissions.has("org.create_projects"));
  const base = `/o/${ctx.org.slug}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{ctx.org.name}</p>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        </div>
        {canCreate && (
          <Link href={`${base}/projects/new`} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            New project
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
          <p className="font-medium text-foreground">No projects yet</p>
          <p className="mt-1">
            {canCreate
              ? "Create a project such as your app or website, then add its versions and team."
              : "Ask an admin to add you to a project."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`${base}/p/${p.key}`}
                className="block h-full rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold">{p.key}</span>
                  <span className="truncate font-medium">{p.name}</span>
                  {p.status === "archived" && <span className="ml-auto text-xs text-muted">Archived</span>}
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>}
                <p className="mt-3 text-xs text-muted">
                  <span className="font-medium text-foreground">{p.openBugs}</span> open of {p.totalBugs}
                  {p.latestVersion && <> · latest version {p.latestVersion}</>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Assigned to you</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">Nothing open is assigned to you.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {mine.map((b) => (
              <li key={`${b.projectKey}-${b.number}`}>
                <Link
                  href={`${base}/p/${b.projectKey}/bugs/${b.number}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-surface-2"
                >
                  <span className="font-mono text-xs text-muted">
                    {b.projectKey}-{b.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <PriorityBadge value={b.priority} />
                  <StatusPill name={b.statusName} color={b.statusColor} />
                  <span className="text-xs text-muted">
                    <LocalTime iso={new Date(b.updatedAt).toISOString()} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
