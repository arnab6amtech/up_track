import Link from "next/link";
import { Suspense } from "react";
import { ImportForm } from "@/components/import-form";
import { LocalTime } from "@/components/local-time";
import { RemoveWorkbookButton } from "@/components/remove-workbook-button";
import { getWorkbooks, type WorkbookSummary } from "@/lib/data";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Import sheet — UpTrack" };

const SOURCE_LABEL: Record<WorkbookSummary["sourceType"], string> = {
  drive: "Google Drive, read live",
  upload: "Uploaded file",
  local: "Local file",
};

export default function ImportPage() {
  const driveReady = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Import a sheet</h1>
          <p className="mt-1 text-sm text-muted">
            Add any spreadsheet of bugs or test cases. UpTrack finds the column names, and you confirm what each one
            holds in the next step. Each import becomes a workbook you can switch to from the header.
          </p>
        </div>
        <ImportForm driveReady={driveReady} />
      </section>

      <section id="workbooks" className="scroll-mt-20 space-y-3">
        <h2 className="text-sm font-semibold">Workbooks</h2>
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-surface-2" />}>
          <WorkbookList />
        </Suspense>
      </section>
    </div>
  );
}

async function WorkbookList() {
  await requireUser("/sheets");
  const workbooks = await getWorkbooks();
  if (workbooks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        Nothing imported yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {workbooks.map((w, i) => (
        <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link href={i === 0 ? "/sheets" : `/sheets?wb=${encodeURIComponent(w.id)}`} className="font-medium hover:underline">
              {w.name}
            </Link>
            <p className="text-xs text-muted">
              {SOURCE_LABEL[w.sourceType]}
              {w.builtIn ? " · set in server settings" : null}
              {w.createdAt && (
                <>
                  {" · added "}
                  <LocalTime iso={w.createdAt} />
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/sheets/import/${encodeURIComponent(w.id)}`}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent"
            >
              Edit columns
            </Link>
            {w.builtIn ? (
              <span className="text-xs text-muted">Default</span>
            ) : (
              <RemoveWorkbookButton id={w.id} name={w.name} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
