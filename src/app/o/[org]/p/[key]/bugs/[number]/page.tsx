import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentCommandBar } from "@/components/agent-command";
import { BugPanel, CommentForm, CreateShareLink } from "@/components/bug-forms";
import { BugTextSections } from "@/components/bug-text";
import { CaptureDetails, mediaLinks } from "@/components/capture-details";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import { MediaGallery } from "@/components/media-gallery";
import { RichText } from "@/components/rich-text";
import { PriorityBadge, SeverityBadge, StatusPill } from "@/components/tracker-badges";
import { PRIORITY_LABEL, RESOLUTION_LABEL, SEVERITY_LABEL } from "@/lib/labels";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { revokeShareLinkAction } from "@/server/actions/project";
import { getBug, listActivity, listComments, listShareLinks, listStatuses, type ActivityItem } from "@/server/bugs";
import { listComponents, listProjectMembers, listVersions } from "@/server/projects";

export default function BugPage({ params }: PageProps<"/o/[org]/p/[key]/bugs/[number]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
      <Bug params={params} />
    </Suspense>
  );
}

const iso = (d: Date | string) => new Date(d).toISOString();

function describeValue(field: string | null, value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  const v = String(value);
  if (field === "severity") return SEVERITY_LABEL[v] ?? v;
  if (field === "priority") return PRIORITY_LABEL[v] ?? v;
  if (field === "resolution") return RESOLUTION_LABEL[v] ?? v;
  return v.length > 60 ? `${v.slice(0, 60)}…` : v;
}

function describeActivity(a: ActivityItem): string {
  if (a.action === "created") return "reported this bug";
  if (a.action === "commented") return "commented";
  if (a.action === "status_changed") return `moved it from ${describeValue(a.field, a.oldValue)} to ${describeValue(a.field, a.newValue)}`;
  if (a.action === "assigned") return a.newValue ? `assigned it to ${describeValue(a.field, a.newValue)}` : "unassigned it";
  if (["description", "steps", "expected result", "actual result", "environment"].includes(a.field ?? "")) return `edited the ${a.field}`;
  return `changed ${a.field} from ${describeValue(a.field, a.oldValue)} to ${describeValue(a.field, a.newValue)}`;
}

async function Bug({ params }: Pick<PageProps<"/o/[org]/p/[key]/bugs/[number]">, "params">) {
  const { org, key, number } = await params;
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  const bug = /^\d+$/.test(number) ? await getBug(ctx.org.id, access.project.id, Number(number)) : null;
  if (!bug) notFound();
  const p = access.permissions;
  const [statuses, versions, components, members, comments, activity, shareLinks] = await Promise.all([
    listStatuses(ctx.org.id),
    listVersions(ctx.org.id, access.project.id),
    listComponents(ctx.org.id, access.project.id),
    listProjectMembers(ctx.org.id, access.project.id),
    listComments(ctx.org.id, bug.id),
    listActivity(ctx.org.id, bug.id),
    p.has("bug.share") ? listShareLinks(ctx.org.id, bug.id) : Promise.resolve([]),
  ]);
  const bugKey = `${bug.projectKey}-${bug.number}`;
  const base = `/o/${org}/p/${bug.projectKey}`;
  const media = mediaLinks(bug.attachments);
  const editor = { org, project: bug.projectKey, bugId: bug.id, lockVersion: bug.lockVersion };

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={base} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent">
          Back to {bug.projectName}
        </Link>
        <span className="font-mono text-xs text-muted">{bugKey}</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <header className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h1 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{bug.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill name={bug.resolution ? `${bug.statusName} · ${RESOLUTION_LABEL[bug.resolution]}` : bug.statusName} color={bug.statusColor} />
              <SeverityBadge value={bug.severity} />
              <PriorityBadge value={bug.priority} />
            </div>
            <dl className="grid gap-x-6 gap-y-2 pt-1 text-sm sm:grid-cols-2">
              {(
                [
                  ["Found in", bug.foundInVersionName],
                  ["Fixed in", bug.fixedInVersionName ?? "—"],
                  ["Module", bug.componentName ?? "—"],
                  ["Assignee", bug.assigneeName ?? "Nobody"],
                  ["Reported by", bug.reporterName],
                  ["Reported", <LocalTime key="c" iso={iso(bug.createdAt)} />],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
            <AgentCommandBar id={bugKey} />
          </header>

          <BugTextSections
            canEdit={p.has("bug.edit")}
            editor={editor}
            text={{
              title: bug.title,
              description: bug.description,
              stepsToReproduce: bug.stepsToReproduce,
              expectedResult: bug.expectedResult,
              actualResult: bug.actualResult,
              environment: bug.environment,
            }}
          />

          {bug.capture && <CaptureDetails capture={bug.capture} />}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Comments <span className="font-normal text-muted">({comments.length})</span>
            </h2>
            {comments.length > 0 && (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
                    <p className="mb-1.5 text-xs text-muted">
                      <span className="font-medium text-foreground">{c.authorName}</span> · <LocalTime iso={iso(c.createdAt)} />
                    </p>
                    <RichText text={c.body} />
                  </li>
                ))}
              </ul>
            )}
            {p.has("bug.comment") && <CommentForm org={org} project={bug.projectKey} bugId={bug.id} />}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">History</h2>
            <ol className="space-y-2 border-l border-line pl-4">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.actorName ?? "UpTrack"}</span> {describeActivity(a)}{" "}
                  <span className="text-xs text-muted">
                    · <LocalTime iso={iso(a.createdAt)} />
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <BugPanel
              {...editor}
              currentUserId={ctx.user.id}
              statuses={statuses.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
              versions={versions.map((v) => ({ id: v.id, name: v.name }))}
              components={components.map((c) => ({ id: c.id, name: c.name }))}
              members={members.map((m) => ({ id: m.userId, name: m.fullName }))}
              bug={{
                statusId: bug.statusId,
                resolution: bug.resolution,
                assigneeId: bug.assigneeId,
                severity: bug.severity,
                priority: bug.priority,
                fixedInVersionId: bug.fixedInVersionId,
                componentId: bug.componentId,
              }}
              can={{
                changeStatus: p.has("bug.change_status"),
                verify: p.has("bug.verify"),
                assign: p.has("bug.assign"),
                edit: p.has("bug.edit"),
              }}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Reference <span className="font-normal text-muted">({media.length})</span>
            </h2>
            <MediaGallery items={media} stacked />
          </section>

          {p.has("bug.share") && (
            <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">Share outside UpTrack</h2>
              <CreateShareLink org={org} project={bug.projectKey} bugId={bug.id} />
              {shareLinks.length > 0 && (
                <ul className="divide-y divide-line text-xs">
                  {shareLinks.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-muted">
                        Link from <LocalTime iso={iso(l.createdAt)} /> · {l.viewCount} {l.viewCount === 1 ? "view" : "views"}
                        {l.expiresAt && (
                          <>
                            {" "}
                            · expires <LocalTime iso={iso(l.expiresAt)} />
                          </>
                        )}
                      </span>
                      <ConfirmButton
                        action={revokeShareLinkAction}
                        fields={{ org, project: bug.projectKey, bugId: bug.id, linkId: l.id }}
                        confirm="Revoke this link? Anyone using it loses access."
                        label="Revoke"
                        pendingLabel="Revoking…"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
