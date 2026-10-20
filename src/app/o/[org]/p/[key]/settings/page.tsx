import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import {
  AddComponentForm,
  AddPlatformForm,
  AddProjectMemberForm,
  AddVersionForm,
  ProjectGeneralForm,
  ProjectMemberRoleSelect,
  VersionStatusSelect,
} from "@/components/project-settings-forms";
import { VERSION_STATUS_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { archiveComponentAction, archivePlatformAction, removeProjectMemberAction } from "@/server/actions/project";
import { listMembers, listRoles } from "@/server/orgs";
import { listComponents, listPlatforms, listProjectMembers, listVersions } from "@/server/projects";

export const metadata = { title: "Project settings — UpTrack" };

export default function ProjectSettingsPage({ params }: PageProps<"/o/[org]/p/[key]/settings">) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
        <Settings params={params} />
      </Suspense>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
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

  return (
    <>
      <div className="space-y-3">
        <Link href={`/o/${org}/p/${access.project.key}`} className="inline-block rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent">
          Back to bugs
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {access.project.name} <span className="font-mono text-base font-normal text-muted">{access.project.key}</span>
        </h1>
      </div>

      {canManage && (
        <Section title="General">
          <div className="rounded-xl border border-line bg-surface p-5">
            <ProjectGeneralForm
              ids={ids}
              name={access.project.name}
              description={access.project.description ?? ""}
              archived={access.project.status === "archived"}
            />
          </div>
        </Section>
      )}

      <Section title="Versions" hint="Bugs are reported against a version. Mark one “In testing” to make it the default in the report form.">
        {canVersions && (
          <div className="rounded-xl border border-line bg-surface p-4">
            <AddVersionForm ids={ids} />
          </div>
        )}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {versions.length === 0 && <li className="px-4 py-3 text-sm text-muted">No versions yet.</li>}
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{v.name}</p>
                <p className="text-xs text-muted">
                  {v.openBugCount} open of {v.bugCount} bugs found
                  {v.releaseDate && <> · release {v.releaseDate}</>}
                </p>
              </div>
              {canVersions ? (
                <VersionStatusSelect ids={ids} versionId={v.id} status={v.status} />
              ) : (
                <span className="text-xs text-muted">{VERSION_STATUS_LABEL[v.status]}</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {canManage && (
        <Section
          title="Platforms"
          hint="The products this project covers, such as Admin panel, User website, Vendor website or User app. With platforms, every new bug says which one it was found on, and the bug list gets a tab for each."
        >
          <div className="rounded-xl border border-line bg-surface p-4">
            <AddPlatformForm ids={ids} />
          </div>
          {platforms.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {platforms.map((pl) => (
                <li key={pl.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm">
                    {pl.name} <span className="text-xs text-muted">· {pl.bugCount} bugs</span>
                  </span>
                  <ConfirmButton
                    action={archivePlatformAction}
                    fields={{ ...ids, platformId: pl.id }}
                    confirm={`Remove the platform ${pl.name}? Its bugs keep it; it just can't be picked any more.`}
                    label="Remove"
                    pendingLabel="Removing…"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {canManage && (
        <Section title="Features" hint="Areas of the product, such as Checkout or Admin panel. Every new bug names the feature it's in, so add at least one before reporting.">
          <div className="rounded-xl border border-line bg-surface p-4">
            <AddComponentForm ids={ids} />
          </div>
          {components.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {components.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm">
                    {c.name} <span className="text-xs text-muted">· {c.bugCount} bugs</span>
                  </span>
                  <ConfirmButton
                    action={archiveComponentAction}
                    fields={{ ...ids, componentId: c.id }}
                    confirm={`Remove the feature ${c.name}? Its bugs keep it; it just can't be picked any more.`}
                    label="Remove"
                    pendingLabel="Removing…"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {canManage && (
        <Section title="Team" hint="Developers fix bugs; SQA engineers report, assign and verify them; managers also run the project.">
          <div className="rounded-xl border border-line bg-surface p-4">
            <AddProjectMemberForm
              ids={ids}
              people={orgMembers.filter((m) => !onProject.has(m.userId)).map((m) => ({ id: m.userId, name: m.fullName }))}
              roles={projectRoles.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
            />
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.fullName}</p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <ProjectMemberRoleSelect ids={ids} userId={m.userId} roleId={m.roleId} roles={projectRoles.map((r) => ({ id: r.id, name: r.name }))} />
                <ConfirmButton
                  action={removeProjectMemberAction}
                  fields={{ ...ids, userId: m.userId }}
                  confirm={`Remove ${m.fullName} from ${access.project.name}?`}
                  label="Remove"
                  pendingLabel="Removing…"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
