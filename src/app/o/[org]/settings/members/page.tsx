import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import { InviteForm, MemberRoleSelect } from "@/components/org-forms";
import { getOrgContext } from "@/server/access";
import { removeMemberAction, revokeInvitationAction } from "@/server/actions/org";
import { listInvitations, listMembers, listRoles } from "@/server/orgs";
import { listProjects } from "@/server/projects";

export const metadata = { title: "Members — UpTrack" };

export default function MembersPage({ params }: PageProps<"/o/[org]/settings/members">) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-2" />}>
        <Members params={params} />
      </Suspense>
    </div>
  );
}

async function Members({ params }: Pick<PageProps<"/o/[org]/settings/members">, "params">) {
  const ctx = await getOrgContext((await params).org);
  // A personal workspace is just its owner.
  if (ctx.org.kind === "personal") notFound();
  const canManage = ctx.permissions.has("org.manage_members");
  const [members, roles, invitations, projects] = await Promise.all([
    listMembers(ctx.org.id),
    listRoles(ctx.org.id, "organization"),
    canManage ? listInvitations(ctx.org.id) : Promise.resolve([]),
    canManage ? listProjects(ctx.org.id, ctx.user.id, true) : Promise.resolve([]),
  ]);
  // Only owners hand out the owner role.
  const assignable = ctx.role.key === "owner" ? roles : roles.filter((r) => r.key !== "owner");

  return (
    <>
      <div>
        <p className="text-xs text-muted">{ctx.org.name}</p>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted">
          Organization roles control access to settings and members. What someone does on a project (developer, SQA
          engineer, viewer) is set when you invite them, and can be changed in each project&apos;s settings.
        </p>
      </div>

      {canManage && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <div>
            <h2 className="text-sm font-semibold">Invite developers and QA</h2>
            <p className="mt-0.5 text-xs text-muted">They get an email to accept or decline, and join the projects you pick.</p>
          </div>
          <InviteForm
            org={ctx.org.slug}
            projects={projects.filter((p) => p.status === "active").map((p) => ({ id: p.id, key: p.key, name: p.name }))}
            canInviteAdmin={ctx.role.key === "owner" || ctx.role.key === "admin"}
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          People <span className="font-normal text-muted">({members.length})</span>
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.fullName} {m.userId === ctx.user.id && <span className="font-normal text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.email} · joined <LocalTime iso={new Date(m.joinedAt).toISOString()} />
                </p>
              </div>
              {canManage && m.userId !== ctx.user.id && (m.roleKey !== "owner" || ctx.role.key === "owner") ? (
                <>
                  <MemberRoleSelect org={ctx.org.slug} userId={m.userId} roleId={m.roleId} roles={assignable} />
                  <ConfirmButton
                    action={removeMemberAction}
                    fields={{ org: ctx.org.slug, userId: m.userId }}
                    confirm={`Remove ${m.fullName}? They lose access right away; their bugs and comments stay.`}
                    label="Remove"
                    pendingLabel="Removing…"
                  />
                </>
              ) : (
                <span className="text-xs text-muted">{m.roleName}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Invitations</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted">
                    {i.roleName}
                    {i.projects ? ` on ${i.projects.join(", ")}` : i.roleName === "Admin" ? "" : " on all projects"}
                    {i.state === "pending" && (
                      <>
                        {" "}
                        · {i.emailed ? "emailed" : "link shared"} · expires <LocalTime iso={new Date(i.expiresAt).toISOString()} />
                      </>
                    )}
                  </p>
                </div>
                {i.state === "declined" ? (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Declined</span>
                ) : (
                  <ConfirmButton
                    action={revokeInvitationAction}
                    fields={{ org: ctx.org.slug, invitationId: i.id }}
                    label="Cancel invitation"
                    pendingLabel="Cancelling…"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
