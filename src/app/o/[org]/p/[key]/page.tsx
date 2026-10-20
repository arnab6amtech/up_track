import Link from "next/link";
import { Suspense } from "react";
import { CopyFixButton } from "@/components/agent-command";
import { AssigneeSelect, type AssigneeOption } from "@/components/assignee-select";
import { Avatar } from "@/components/avatar";
import { mediaLinks } from "@/components/capture-details";
import { ProjectNavChips, ProjectSidebar } from "@/components/project-sidebar";
import { ReferenceButton } from "@/components/reference-drawer";
import { StatusSelect, type StatusOption } from "@/components/status-select";
import { SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { TrackerFilters, type FilterSelect } from "@/components/tracker-filters";
import { RESOLUTION_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { BUGS_PAGE_SIZE, listBugs, listStatuses, type BugFilters, type BugListItem } from "@/server/bugs";
import { listComponents, listPlatforms, listProjectMembers, listVersions } from "@/server/projects";
import { listSeverities } from "@/server/workflow";

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
    platform: param(sp.platform),
    assignee: param(sp.assignee),
    severity: param(sp.severity),
    sort: param(sp.sort) || "updated",
  };
  const page = Math.max(1, Number(param(sp.page)) || 1);
  const filters: BugFilters = { ...values, status: values.status === "all" ? "" : values.status, sort: values.sort as BugFilters["sort"], page };

  const [{ items, total }, statuses, severities, versions, platforms, components, members] = await Promise.all([
    listBugs(ctx.org.id, project.id, ctx.user.id, filters),
    listStatuses(ctx.org.id, project.id),
    listSeverities(ctx.org.id, project.id),
    listVersions(ctx.org.id, project.id),
    listPlatforms(ctx.org.id, project.id),
    listComponents(ctx.org.id, project.id),
    listProjectMembers(ctx.org.id, project.id),
  ]);
  const base = `/o/${org}/p/${project.key}`;
  const statusOptions: StatusOption[] = statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color }));
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
    { name: "severity", label: "Severity", options: [{ value: "", label: "All" }, ...severities.map((s) => ({ value: s.id, label: s.name }))] },
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
  const listHref = (patch: Partial<typeof values>, n = 1) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...values, ...patch })) {
      if (v && !(k === "status" && v === "open") && !(k === "sort" && v === "updated")) qs.set(k, v);
    }
    if (n > 1) qs.set("page", String(n));
    return `${base}${qs.size ? `?${qs}` : ""}`;
  };
  const pageHref = (n: number) => listHref({}, n);

  // Without a platform picked, each row says which platform its bug is on.
  const showPlatform = platforms.length > 0 && !values.platform;
  // Assigning from the list follows the bug page: people who assign pick anyone; others who work on bugs
  // can only take one themselves.
  const canAssign = permissions.has("bug.assign");
  const canTake = permissions.has("bug.change_status");
  const assigneeOptions: AssigneeOption[] = canAssign
    ? members.map((m) => ({ id: m.userId, name: m.userId === ctx.user.id ? `${m.fullName} (me)` : m.fullName }))
    : canTake
      ? [{ id: ctx.user.id, name: `${ctx.user.fullName} (me)` }]
      : [];
  const pickedPlatform = platforms.find((p) => p.id === values.platform);
  const reportHref = permissions.has("bug.create") && versions.length > 0 ? `${base}/bugs/new${pickedPlatform ? `?platform=${pickedPlatform.id}` : ""}` : null;
  // What's listed: the platform, then the status ("Open bugs", "Done", a status name, or every status).
  const platformTitle = values.platform === "none" ? "No platform" : (pickedPlatform?.name ?? (platforms.length ? "All platforms" : "Bugs"));
  const statusTitle =
    values.status === "open" ? "Open bugs" : values.status === "done" ? "Done" : values.status === "all" ? "Every status" : statuses.find((s) => s.id === values.status)?.name;
  const place = { page: "bugs" as const, platform: values.platform, status: values.status };

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <ProjectSidebar org={org} projectKey={project.key} place={place} reportPlatform={pickedPlatform?.id} />
      <div className="min-w-0 space-y-5">
        {/* Narrow screens: the project and its buttons here; wide screens have them in the sidebar. */}
        <div className="flex flex-wrap items-end justify-between gap-3 lg:hidden">
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
            <Link href={`${base}/settings`} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:border-accent">
              Settings
            </Link>
            {reportHref && (
              <Link href={reportHref} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                Report bug
              </Link>
            )}
          </div>
        </div>
        {/* Wide screens: what's listed, named after the view and platform. */}
        <div className="hidden lg:block">
          <p className="text-xs text-muted">
            <Link href={`/o/${org}`} className="hover:underline">
              {ctx.org.name}
            </Link>{" "}
            / <span className="font-mono">{project.key}</span>
            {project.status === "archived" && <> · Archived</>}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            {platformTitle}
            {statusTitle && <span className="font-normal text-muted"> · {statusTitle}</span>}
          </h1>
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
            <ProjectNavChips org={org} projectKey={project.key} place={place} />
            <TrackerFilters basePath={base} values={values} selects={selects} placeholder="Search titles and descriptions, or jump to a bug number" />
            <p className="text-sm font-medium">
              {total.toLocaleString()} {total === 1 ? "bug" : "bugs"}
            </p>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
                {total === 0 && values.status === "open" && !values.q ? "No open bugs. Nice." : "Nothing matches these filters."}
              </div>
            ) : (
              // No overflow clipping here: the status menu's resolution prompt hangs below its row.
              <div className="rounded-xl border border-line bg-surface">
                <div className={`hidden gap-4 rounded-t-xl border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted md:grid ${GRID}`}>
                  <span>Key</span>
                  <span>{showPlatform ? "Platform · Feature" : "Feature"}</span>
                  <span>Bug</span>
                  <span>Severity</span>
                  <span>Status</span>
                  <span className="text-center">Assignee</span>
                  <span className="text-right">Reference</span>
                  <span className="text-right">Agent</span>
                </div>
                <ul className="divide-y divide-line [&>li:first-child>div]:rounded-t-xl md:[&>li:first-child>div]:rounded-t-none [&>li:last-child>div]:rounded-b-xl">
                  {items.map((b) => (
                    <li key={b.id}>
                      <BugRow
                        bug={b}
                        projectKey={project.key}
                        href={`${base}/bugs/${b.number}`}
                        showPlatform={showPlatform}
                        status={
                          permissions.has("bug.change_status") ? { org, statuses: statusOptions, canVerify: permissions.has("bug.verify") } : null
                        }
                        assign={canAssign || canTake ? { org, options: assigneeOptions, canUnassign: canAssign } : null}
                      />
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
    </div>
  );
}

const GRID = "md:grid-cols-[4.5rem_9rem_minmax(0,1fr)_6rem_9rem_4.5rem_4.5rem_4.5rem]";

interface Assigning {
  org: string;
  options: AssigneeOption[];
  canUnassign: boolean;
}

interface StatusEditing {
  org: string;
  statuses: StatusOption[];
  canVerify: boolean;
}

function BugRow({
  bug: b,
  projectKey,
  href,
  showPlatform,
  status: editing,
  assign,
}: {
  bug: BugListItem;
  projectKey: string;
  href: string;
  /** On the "All platforms" tab, say which platform each bug is on. */
  showPlatform: boolean;
  status: StatusEditing | null;
  /** Null when the person can't change who has the bug. */
  assign: Assigning | null;
}) {
  const key = `${projectKey}-${b.number}`;
  const assignee = assign ? (
    <AssigneeSelect
      key={b.lockVersion}
      org={assign.org}
      project={projectKey}
      bugId={b.id}
      lockVersion={b.lockVersion}
      assigneeId={b.assigneeId}
      assigneeName={b.assigneeName}
      options={assign.options}
      canUnassign={assign.canUnassign}
    />
  ) : b.assigneeId ? (
    <span title={`Assigned to ${b.assigneeName}`} className="inline-flex">
      <Avatar id={b.assigneeId} name={b.assigneeName ?? "?"} size="sm" />
    </span>
  ) : (
    <span className="text-xs text-muted" title="Unassigned">
      –
    </span>
  );
  // People who can move bugs change the status right here; everyone else sees it read-only.
  const status = editing ? (
    <StatusSelect
      key={b.lockVersion}
      org={editing.org}
      project={projectKey}
      bugId={b.id}
      lockVersion={b.lockVersion}
      statusId={b.statusId}
      resolution={b.resolution}
      statuses={editing.statuses}
      canVerify={editing.canVerify}
    />
  ) : (
    <StatusPill name={b.resolution ? `${b.statusName} · ${RESOLUTION_LABEL[b.resolution]}` : b.statusName} color={b.statusColor} />
  );
  const reference = <ReferenceButton media={mediaLinks(b.media)} title={b.title} refLabel={key} href={href} />;
  const fix = <CopyFixButton id={key} />;
  // The whole row is clickable through the title link's ::after overlay; the buttons sit above it.
  return (
    <div className={`relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 text-sm hover:bg-surface-2 md:items-center md:gap-y-0 ${GRID}`}>
      <span className="font-mono text-xs text-muted">{key}</span>
      <span className="text-right md:hidden">{status}</span>
      <span className="col-span-2 min-w-0 text-xs md:col-span-1">
        {showPlatform && <span className="block truncate text-muted">{b.platformName ?? "No platform"}</span>}
        <span className="block truncate font-medium">{b.componentName ?? <span className="font-normal text-muted">No feature</span>}</span>
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
        <SeverityBadge name={b.severityName} color={b.severityColor} />
        <span className="ml-auto flex items-center gap-2 md:hidden">
          {assignee}
          {reference}
          {fix}
        </span>
      </span>
      <span className="hidden md:block">{status}</span>
      <span className="hidden justify-center md:flex">{assignee}</span>
      <span className="hidden text-right md:block">{reference}</span>
      <span className="hidden text-right md:block">{fix}</span>
    </div>
  );
}
