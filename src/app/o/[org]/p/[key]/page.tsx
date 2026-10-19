import Link from "next/link";
import { Suspense } from "react";
import { CopyFixButton } from "@/components/agent-command";
import { PriorityBadge, SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { TrackerFilters, type FilterSelect } from "@/components/tracker-filters";
import { PRIORITY_LABEL, RESOLUTION_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { BUGS_PAGE_SIZE, listBugs, listStatuses, PRIORITIES, SEVERITIES, type BugFilters } from "@/server/bugs";
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
    priority: param(sp.priority),
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
    ...(components.length
      ? [{ name: "component", label: "Module", options: [{ value: "", label: "All" }, ...components.map((c) => ({ value: c.id, label: c.name }))] }]
      : []),
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
    { name: "priority", label: "Priority", options: [{ value: "", label: "All" }, ...PRIORITIES.map((s) => ({ value: s, label: PRIORITY_LABEL[s] }))] },
    {
      name: "sort",
      label: "Sort",
      allValue: "updated",
      options: [
        { value: "updated", label: "Recently updated" },
        { value: "created", label: "Newest" },
        { value: "priority", label: "Priority" },
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
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {items.map((b) => {
                const href = `${base}/bugs/${b.number}`;
                return (
                  <li key={b.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2 md:flex-nowrap">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">
                      {project.key}-{b.number}
                    </span>
                    <div className="min-w-0 flex-1 basis-full md:basis-auto">
                      <Link href={href} className="line-clamp-2 text-sm font-medium after:absolute after:inset-0">
                        {b.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {b.versionName}
                        {b.componentName && <> · {b.componentName}</>}
                        {b.assigneeName ? <> · {b.assigneeName}</> : <> · unassigned</>}
                        {b.attachmentCount > 0 && <> · {b.attachmentCount} {b.attachmentCount === 1 ? "file" : "files"}</>}
                        {b.hasCapture && <> · API log</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SeverityBadge value={b.severity} />
                      <PriorityBadge value={b.priority} />
                      <StatusPill name={b.resolution ? `${b.statusName} · ${RESOLUTION_LABEL[b.resolution]}` : b.statusName} color={b.statusColor} />
                      <CopyFixButton id={`${project.key}-${b.number}`} />
                    </div>
                  </li>
                );
              })}
            </ul>
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
