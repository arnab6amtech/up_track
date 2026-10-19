import Link from "next/link";
import { Suspense } from "react";
import { CopyFixButton } from "@/components/agent-command";
import { mediaLinks } from "@/components/capture-details";
import { ReferenceButton } from "@/components/reference-drawer";
import { SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { TrackerFilters, type FilterSelect } from "@/components/tracker-filters";
import { RESOLUTION_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { BUGS_PAGE_SIZE, listBugs, listStatuses, SEVERITIES, type BugFilters, type BugListItem } from "@/server/bugs";
import { listComponents, listProjectMembers, listVersions } from "@/server/projects";

export default function ProjectBugsPage({ params, searchParams }: PageProps<"/o/[org]/p/[key]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
      <ProjectBugs params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

async function ProjectBugs({ params, searchParams }: Pick<PageProps<"/o/[org]/p/[key]">, "params" | "searchParams">) {
  const { org, key } = await params;
  const sp = await searchParams;
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  const { project, permissions } = access;

  // Open bugs unless asked otherwise.
  const values = {
    q: param(sp.q),
    status: param(sp.status) || "open",
    version: param(sp.version),
    component: param(sp.component),
    assignee: param(sp.assignee),
    severity: param(sp.severity),
    sort: param(sp.sort) || "updated",
  };
  const page = Math.max(1, Number(param(sp.page)) || 1);
  const filters: BugFilters = { ...values, status: values.status === "all" ? "" : values.status, sort: values.sort as BugFilters["sort"], page };

  const [{ items, total }, statuses, versions, components, members] = await Promise.all([
    listBugs(ctx.org.id, project.id, ctx.user.id, filters),
    listStatuses(ctx.org.id),
    listVersions(ctx.org.id, project.id),
    listComponents(ctx.org.id, project.id),
    listProjectMembers(ctx.org.id, project.id),
  ]);
  const base = `/o/${org}/p/${project.key}`;
  const pages = Math.max(1, Math.ceil(total / BUGS_PAGE_SIZE));

  const selects: FilterSelect[] = [
    {
      name: "status",
      label: "Status",
      allValue: "all",
      options: [
        { value: "open", label: "Open" },
        { value: "done", label: "Done" },
        { value: "all", label: "All" },
        ...statuses.map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    { name: "version", label: "Version", options: [{ value: "", label: "All" }, ...versions.map((v) => ({ value: v.id, label: v.name }))] },
    { name: "component", label: "Feature", options: [{ value: "", label: "All" }, ...components.map((c) => ({ value: c.id, label: c.name }))] },
    {
      name: "assignee",
      label: "Assignee",
      options: [
        { value: "", label: "Anyone" },
        { value: "me", label: "Me" },
        { value: "none", label: "Nobody" },
        ...members.map((m) => ({ value: m.userId, label: m.fullName })),
      ],
    },
    { name: "severity", label: "Severity", options: [{ value: "", label: "All" }, ...SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))] },
    {
      name: "sort",
      label: "Sort",
      allValue: "updated",
      options: [
        { value: "updated", label: "Recently updated" },
        { value: "created", label: "Newest" },
        { value: "severity", label: "Severity" },
      ],
    },
  ];
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v && !(k === "status" && v === "open") && !(k === "sort" && v === "updated")) qs.set(k, v);
    if (n > 1) qs.set("page", String(n));
    return `${base}${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            <Link href={`/o/${org}`} className="hover:underline">
              {ctx.org.name}
            </Link>{" "}
            / <span className="font-mono">{project.key}</span>
          </p>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {project.name}
            {project.status === "archived" && <span className="ml-2 text-sm font-normal text-muted">Archived</span>}
          </h1>
        </div>
        <div className="flex gap-2">
          {(permissions.has("project.manage") || permissions.has("project.manage_versions")) && (
            <Link href={`${base}/settings`} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:border-accent">
              Settings
            </Link>
          )}
          {permissions.has("bug.create") && versions.length > 0 && (
            <Link href={`${base}/bugs/new`} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              Report bug
            </Link>
          )}
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
          <p className="font-medium text-foreground">Add a version first</p>
          <p className="mt-1">Every bug is reported against a version of the project.</p>
          {permissions.has("project.manage_versions") && (
            <Link href={`${base}/settings`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-medium text-white">
              Add a version
            </Link>
          )}
        </div>
      ) : (
        <>
          <TrackerFilters basePath={base} values={values} selects={selects} placeholder="Search titles and descriptions, or jump to a bug number" />
          <p className="text-sm font-medium">
            {total.toLocaleString()} {total === 1 ? "bug" : "bugs"}
          </p>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
              {total === 0 && values.status === "open" && !values.q ? "No open bugs. Nice." : "Nothing matches these filters."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className={`hidden gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted md:grid ${GRID}`}>
                <span>Key</span>
                <span>Feature</span>
                <span>Bug</span>
                <span>Severity</span>
                <span>Status</span>
                <span className="text-right">Reference</span>
                <span className="text-right">Agent</span>
              </div>
              <ul className="divide-y divide-line">
                {items.map((b) => (
                  <li key={b.id}>
                    <BugRow bug={b} projectKey={project.key} href={`${base}/bugs/${b.number}`} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-3 text-xs" aria-label="Pagination">
              <span className="text-muted">
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                {page > 1 && (
                  <Link href={pageHref(page - 1)} className="rounded-md border border-line px-2.5 py-1.5 font-medium hover:border-accent">
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={pageHref(page + 1)} className="rounded-md border border-line px-2.5 py-1.5 font-medium hover:border-accent">
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

const GRID = "md:grid-cols-[5rem_10rem_minmax(0,1fr)_6rem_9rem_5rem_4.5rem]";

function BugRow({ bug: b, projectKey, href }: { bug: BugListItem; projectKey: string; href: string }) {
  const key = `${projectKey}-${b.number}`;
  const status = <StatusPill name={b.resolution ? `${b.statusName} · ${RESOLUTION_LABEL[b.resolution]}` : b.statusName} color={b.statusColor} />;
  const reference = <ReferenceButton media={mediaLinks(b.media)} title={b.title} refLabel={key} href={href} />;
  const fix = <CopyFixButton id={key} />;
  // The whole row is clickable through the title link's ::after overlay; the buttons sit above it.
  return (
    <div className={`relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 text-sm hover:bg-surface-2 md:items-center md:gap-y-0 ${GRID}`}>
      <span className="font-mono text-xs text-muted">{key}</span>
      <span className="text-right md:hidden">{status}</span>
      <span className="col-span-2 min-w-0 truncate text-xs font-medium md:col-span-1">
        {b.componentName ?? <span className="font-normal text-muted">No feature</span>}
      </span>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <Link
          href={href}
          className="line-clamp-2 font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-accent focus-visible:after:ring-inset"
        >
          {b.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted">
          Found in {b.versionName} · {b.assigneeName ?? "Unassigned"}
          {b.hasCapture && <> · API log</>}
        </p>
      </div>
      <span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
        <SeverityBadge value={b.severity} />
        <span className="ml-auto flex items-center gap-2 md:hidden">
          {reference}
          {fix}
        </span>
      </span>
      <span className="hidden md:block">{status}</span>
      <span className="hidden text-right md:block">{reference}</span>
      <span className="hidden text-right md:block">{fix}</span>
    </div>
  );
}
