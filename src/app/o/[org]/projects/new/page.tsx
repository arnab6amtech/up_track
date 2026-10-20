import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NewProjectForm } from "@/components/org-forms";
import { getOrgContext } from "@/server/access";

export const metadata = { title: "New project — UpTrack" };

export default function NewProjectPage({ params }: PageProps<"/o/[org]/projects/new">) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Suspense>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/o/[org]/projects/new">, "params">) {
  const ctx = await getOrgContext((await params).org);
  if (ctx.org.kind === "personal" || (!ctx.isAdmin && !ctx.permissions.has("org.create_projects"))) notFound();
  return (
    <>
      <Link href={`/o/${ctx.org.slug}`} className="inline-block rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent">
        Back to projects
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-muted">You&apos;ll be its manager. Add versions, features and teammates in its settings.</p>
      </div>
      <div className="rounded-xl border border-line bg-surface p-5">
        <NewProjectForm org={ctx.org.slug} />
      </div>
    </>
  );
}
