import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportBugForm } from "@/components/report-bug-form";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { listComponents, listPlatforms, listProjectMembers, listVersions } from "@/server/projects";
import { listSeverities } from "@/server/workflow";

export const metadata = { title: "Report a bug — UpTrack" };

export default function ReportBugPage({ params, searchParams }: PageProps<"/o/[org]/p/[key]/bugs/new">) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/o/[org]/p/[key]/bugs/new">, "params" | "searchParams">) {
  const { org, key } = await params;
  // Coming from a platform's tab in the bug list preselects that platform.
  const wanted = (await searchParams).platform;
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  if (!access.permissions.has("bug.create")) notFound();
  const [versions, platforms, components, members, severities] = await Promise.all([
    listVersions(ctx.org.id, access.project.id),
    listPlatforms(ctx.org.id, access.project.id),
    listComponents(ctx.org.id, access.project.id),
    access.permissions.has("bug.assign") ? listProjectMembers(ctx.org.id, access.project.id) : Promise.resolve([]),
    listSeverities(ctx.org.id, access.project.id),
  ]);
  const usable = versions.filter((v) => v.status !== "archived");
  // Most bugs are found in whatever QA is testing right now.
  const defaultVersion = usable.find((v) => v.status === "in_testing") ?? usable[0];
  const base = `/o/${org}/p/${access.project.key}`;
  const canManage = access.permissions.has(usable.length === 0 ? "project.manage_versions" : "project.manage");

  return (
    <>
      <Link href={base} className="inline-block rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent">
        Back to {access.project.name}
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Report a bug in {access.project.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Reporting from a web page? The browser extension adds an annotated screenshot or recording and the page&apos;s API log for you.
        </p>
      </div>
      {usable.length === 0 || components.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          <p className="font-medium text-foreground">{usable.length === 0 ? "Add a version first" : "Add a feature first"}</p>
          <p className="mt-1">
            {usable.length === 0
              ? "Every bug is reported against an active version of the project."
              : "Every bug names the feature it's in, such as Checkout or Admin panel."}
          </p>
          {canManage ? (
            <Link href={`${base}/settings`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-neutral-800">
              Open project settings
            </Link>
          ) : (
            <p className="mt-1">Ask a project manager to add one in the project settings.</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5">
          <ReportBugForm
            org={org}
            project={access.project.key}
            versions={usable.map((v) => ({ id: v.id, name: v.name, status: v.status }))}
            defaultVersionId={defaultVersion.id}
            platforms={platforms.map((p) => ({ id: p.id, name: p.name }))}
            defaultPlatformId={platforms.find((p) => p.id === wanted)?.id}
            components={components.map((c) => ({ id: c.id, name: c.name }))}
            severities={severities.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
            members={members.map((m) => ({ id: m.userId, name: m.fullName }))}
          />
        </div>
      )}
    </>
  );
}
