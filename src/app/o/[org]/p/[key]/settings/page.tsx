import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { BugTabs, type BugTab } from "@/components/bug-tabs";
import {
  AddComponentForm,
  AddPlatformForm,
  AddProjectMemberForm,
  AddVersionForm,
  ArchiveProjectForm,
  ProjectGeneralForm,
  ProjectMemberRoleSelect,
  RemovableChip,
  VersionStatusSelect,
} from "@/components/project-settings-forms";
import { VERSION_STATUS_COLOR, VERSION_STATUS_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { archiveComponentAction, archivePlatformAction, removeProjectMemberAction } from "@/server/actions/project";
import { listMembers, listRoles } from "@/server/orgs";
import { listComponents, listPlatforms, listProjectMembers, listVersions } from "@/server/projects";

export const metadata = { title: "Project settings — UpTrack" };

export default function ProjectSettingsPage({ params }: PageProps<"/o/[org]/p/[key]/settings">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
        <Settings params={params} />
      </Suspense>
    </div>
  );
}

/** One settings section: a heading with a short explanation, then its content. */
function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 max-w-2xl text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const card = "rounded-xl border border-line bg-surface";

/** "2026-11-15" → "Nov 15, 2026". Dates have no time zone, so read them as UTC. */
const formatDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const AVATAR_COLORS = ["#ea580c", "#0891b2", "#7c3aed", "#16a34a", "#db2777", "#2563eb", "#ca8a04", "#475569"];

/** Initials on a colour of the person's own, the same as next to their comments. */
function Avatar({ id, name }: { id: string; name: string }) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

async function Settings({ params }: Pick<PageProps<"/o/[org]/p/[key]/settings">, "params">) {
  const { org, key } = await params;
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  const canManage = access.permissions.has("project.manage");
  const canVersions = access.permissions.has("project.manage_versions");
  if (!canManage && !canVersions) notFound();
  const projectId = access.project.id;
  const [versions, platforms, components, members, orgMembers, projectRoles] = await Promise.all([
    listVersions(ctx.org.id, projectId),
    listPlatforms(ctx.org.id, projectId),
    listComponents(ctx.org.id, projectId),
    listProjectMembers(ctx.org.id, projectId),
    canManage ? listMembers(ctx.org.id) : Promise.resolve([]),
    listRoles(ctx.org.id, "project"),
  ]);
  const ids = { org, project: access.project.key };
  const onProject = new Set(members.map((m) => m.userId));
  const archived = access.project.status === "archived";
  const description = access.project.description ?? "";
  const roleOptions = projectRoles.map((r) => ({ id: r.id, name: r.name }));

  const general = (
    <Section title="General" hint="The project's name and what it covers.">
      <div className={`${card} p-5`}>
        <ProjectGeneralForm ids={ids} name={access.project.name} description={description} archived={archived} />
      </div>
      <div className={`${card} p-5`}>
        <ArchiveProjectForm ids={ids} name={access.project.name} description={description} archived={archived} />
      </div>
    </Section>
  );

  const versionList = (
    <Section title="Versions" hint="Bugs are reported against a version. Mark one “In testing” to make it the default in the report form.">
      <div className={`${card} overflow-hidden`}>
        {canVersions && (
          <div className="border-b border-line bg-surface-2/40 p-4">
            <AddVersionForm ids={ids} />
          </div>
        )}
        {versions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No versions yet. Add the one you&apos;re testing first.</p>
        ) : (
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-14 font-mono text-sm font-semibold">{v.name}</span>
                <div className="min-w-0 flex-1 text-xs text-muted">
                  <span className="font-medium text-foreground">{v.openBugCount}</span> open · {v.bugCount} {v.bugCount === 1 ? "bug" : "bugs"}
                  {v.releaseDate && <> · release {formatDate(v.releaseDate)}</>}
                </div>
                {canVersions ? (
                  <VersionStatusSelect ids={ids} versionId={v.id} status={v.status} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="size-2 rounded-full" style={{ background: VERSION_STATUS_COLOR[v.status] }} aria-hidden />
                    {VERSION_STATUS_LABEL[v.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  const platformList = (
    <Section
      title="Platforms"
      hint="The products this project covers, such as Admin panel, User website or User app. With platforms, every new bug says which one it was found on, and the bug list gets a tab for each. Optional."
    >
      <div className={`${card} space-y-4 p-4`}>
        <AddPlatformForm ids={ids} />
        {platforms.length === 0 ? (
          <p className="text-sm text-muted">No platforms. Bugs aren&apos;t split by platform.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Platforms">
            {platforms.map((pl) => (
              <RemovableChip
                key={pl.id}
                name={pl.name}
                count={pl.bugCount}
                action={archivePlatformAction}
                fields={{ ...ids, platformId: pl.id }}
                confirm={`Remove the platform ${pl.name}? Its bugs keep it; it just can't be picked any more.`}
              />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  const featureList = (
    <Section title="Features" hint="Areas of the product, such as Checkout or Search. Every new bug names the feature it's in, so add at least one before reporting.">
      <div className={`${card} space-y-4 p-4`}>
        <AddComponentForm ids={ids} />
        {components.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No features yet, so bugs can&apos;t be reported to this project. Add one above.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Features">
            {components.map((c) => (
              <RemovableChip
                key={c.id}
                name={c.name}
                count={c.bugCount}
                action={archiveComponentAction}
                fields={{ ...ids, componentId: c.id }}
                confirm={`Remove the feature ${c.name}? Its bugs keep it; it just can't be picked any more.`}
              />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  const team = (
    <Section title="Team" hint="Developers fix bugs; SQA engineers report, assign and verify them; project managers also run the project.">
      <div className={`${card} overflow-hidden`}>
        <div className="border-b border-line bg-surface-2/40 p-4">
          <AddProjectMemberForm
            ids={ids}
            people={orgMembers.filter((m) => !onProject.has(m.userId)).map((m) => ({ id: m.userId, name: m.fullName }))}
            roles={projectRoles.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
          />
        </div>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Avatar id={m.userId} name={m.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.fullName} {m.userId === ctx.user.id && <span className="font-normal text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted">{m.email}</p>
              </div>
              <ProjectMemberRoleSelect ids={ids} userId={m.userId} roleId={m.roleId} roles={roleOptions} />
              <ConfirmButton
                action={removeProjectMemberAction}
                fields={{ ...ids, userId: m.userId }}
                confirm={`Remove ${m.fullName} from ${access.project.name}?`}
                label="Remove"
                pendingLabel="Removing…"
                className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );

  // Version managers who don't run the project only see versions.
  const tabs: BugTab[] = [
    ...(canManage ? [{ id: "general", label: "General", content: general }] : []),
    { id: "versions", label: "Versions", count: versions.length, content: versionList },
    ...(canManage
      ? [
          { id: "platforms", label: "Platforms", count: platforms.length, content: platformList },
          { id: "features", label: "Features", count: components.length, content: featureList },
          { id: "team", label: "Team", count: members.length, content: team },
        ]
      : []),
  ];

  return (
    <>
      <div className="space-y-4">
        <Link
          href={`/o/${org}/p/${access.project.key}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          Back to bugs
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-5">
          <h1 className="text-xl font-semibold tracking-tight">{access.project.name}</h1>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold">{access.project.key}</span>
          {archived && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Archived</span>}
          <p className="w-full text-sm text-muted">Project settings</p>
        </div>
      </div>
      <BugTabs tabs={tabs} label="Settings sections" sidebar />
    </>
  );
}
