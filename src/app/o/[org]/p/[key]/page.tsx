import Link from "next/link";
import { Suspense } from "react";
import { CopyFixButton } from "@/components/agent-command";
import { mediaLinks } from "@/components/capture-details";
import { ReferenceButton } from "@/components/reference-drawer";
import { StatusSelect, type StatusOption } from "@/components/status-select";
import { SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { TrackerFilters, type FilterSelect } from "@/components/tracker-filters";
import { RESOLUTION_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { BUGS_PAGE_SIZE, listBugs, listStatuses, SEVERITIES, type BugFilters, type BugListItem } from "@/server/bugs";
import { listComponents, listPlatforms, listProjectMembers, listVersions } from "@/server/projects";

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

  const [{ items, total, platformCounts }, statuses, versions, platforms, components, members] = await Promise.all([
    listBugs(ctx.org.id, project.id, ctx.user.id, filters),
    listStatuses(ctx.org.id),
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
  const listHref = (patch: Partial<typeof values>, n = 1) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...values, ...patch })) {
      if (v && !(k === "status" && v === "open") && !(k === "sort" && v === "updated")) qs.set(k, v);
    }
    if (n > 1) qs.set("page", String(n));
    return `${base}${qs.size ? `?${qs}` : ""}`;
  };
  const pageHref = (n: number) => listHref({}, n);

  // One tab per platform (in the order they were added), counting bugs under the other filters.
  const countFor = (id: string | null) => platformCounts.find((c) => c.platformId === id)?.n ?? 0;
  const tabs = platforms.length
    ? [
        { value: "", name: "All platforms", count: platformCounts.reduce((n, c) => n + c.n, 0) },
        ...platforms.map((p) => ({ value: p.id, name: p.name, count: countFor(p.id) })),
        // Older bugs, or bugs on a platform that was since removed.
        ...(countFor(null) > 0 || values.platform === "none" ? [{ value: "none", name: "No platform", count: countFor(null) }] : []),
      ]
    : [];
  const showPlatform = tabs.length > 0 && !values.platform;

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
            <Link
              href={`${base}/bugs/new${platforms.some((p) => p.id === values.platform) ? `?platform=${values.platform}` : ""}`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
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
          {tabs.length > 0 && (
            <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Platforms">
              {tabs.map((t) => (
                <Link
                  key={t.value || "all"}
                  href={listHref({ platform: t.value })}
                  aria-current={values.platform === t.value ? "page" : undefined}
                  className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    values.platform === t.value
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface text-muted hover:border-neutral-400 hover:text-foreground"
                  }`}
                >
                  {t.name} <span className="opacity-70">{t.count}</span>
                </Link>
              ))}
            </nav>
          )}
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
  );
}

const GRID = "md:grid-cols-[5rem_10rem_minmax(0,1fr)_6rem_9rem_5rem_4.5rem]";

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
}: {
  bug: BugListItem;
  projectKey: string;
  href: string;
  /** On the "All platforms" tab, say which platform each bug is on. */
  showPlatform: boolean;
  status: StatusEditing | null;
}) {
  const key = `${projectKey}-${b.number}`;
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
