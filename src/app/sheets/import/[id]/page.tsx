import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MappingEditor } from "@/components/mapping-editor";
import { SheetErrorPanel } from "@/components/sheet-error";
import { analyzeWorkbook } from "@/lib/parse";
import { loadWorkbookFile } from "@/lib/source";
import { getMapping, listWorkbooks } from "@/lib/workbooks";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Edit columns — UpTrack" };

export default function EditColumnsPage({ params }: PageProps<"/sheets/import/[id]">) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/sheets/import#workbooks"
        className="inline-block rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
      >
        Back to workbooks
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface-2" />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Pick<PageProps<"/sheets/import/[id]">, "params">) {
  await requireUser("/sheets");
  const { id } = await params;
  const workbook = (await listWorkbooks()).find((w) => w.id === id);
  if (!workbook) notFound();

  let tabs;
  try {
    tabs = analyzeWorkbook((await loadWorkbookFile(workbook.source)).bytes);
  } catch (err) {
    return <SheetErrorPanel error={err instanceof Error ? err.message : String(err)} />;
  }
  const mapping = await getMapping(workbook.id);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        <span className="font-medium text-foreground">{workbook.name}</span>
        {mapping ? " · using your saved columns" : " · columns detected automatically"}
      </p>
      <div className="rounded-xl border border-line bg-surface p-5">
        <MappingEditor mode="edit" workbookId={workbook.id} workbookName={workbook.name} tabs={tabs} initial={mapping} />
      </div>
    </div>
  );
}
