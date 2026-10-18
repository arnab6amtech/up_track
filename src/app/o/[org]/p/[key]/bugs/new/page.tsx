import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportBugForm } from "@/components/report-bug-form";
import { getOrgContext, getProjectAccess } from "@/server/access";
import { listComponents, listProjectMembers, listVersions } from "@/server/projects";

export const metadata = { title: "Report a bug — UpTrack" };

export default function ReportBugPage({ params }: PageProps<"/o/[org]/p/[key]/bugs/new">) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/o/[org]/p/[key]/bugs/new">, "params">) {
  const { org, key } = await params;
  const [ctx, access] = await Promise.all([getOrgContext(org), getProjectAccess(org, key)]);
  if (!access.permissions.has("bug.create")) notFound();
  const [versions, components, members] = await Promise.all([
    listVersions(ctx.org.id, access.project.id),
    listComponents(ctx.org.id, access.project.id),
    access.permissions.has("bug.assign") ? listProjectMembers(ctx.org.id, access.project.id) : Promise.resolve([]),
  ]);
  const usable = versions.filter((v) => v.status !== "archived");
  // Most bugs are found in whatever QA is testing right now.
  const defaultVersion = usable.find((v) => v.status === "in_testing") ?? usable[0];
  const base = `/o/${org}/p/${access.project.key}`;

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
      {usable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          This project has no active versions. Add one in the project settings first.
        </p>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5">
          <ReportBugForm
            org={org}
            project={access.project.key}
            versions={usable.map((v) => ({ id: v.id, name: v.name, status: v.status }))}
            defaultVersionId={defaultVersion.id}
            components={components.map((c) => ({ id: c.id, name: c.name }))}
            members={members.map((m) => ({ id: m.userId, name: m.fullName }))}
          />
        </div>
      )}
    </>
  );
}
