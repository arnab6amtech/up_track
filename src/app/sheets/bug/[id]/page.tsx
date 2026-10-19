import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentCommandBar } from "@/components/agent-command";
import { KeyNav } from "@/components/key-nav";
import { MediaGallery } from "@/components/media-gallery";
import { RichText } from "@/components/rich-text";
import { SheetErrorPanel } from "@/components/sheet-error";
import { StatusBadge } from "@/components/status-badge";
import { getSheetData, getWorkbooks, pickWorkbook } from "@/lib/data";
import { filterRecords, filtersToQuery, PAGE_SIZE, parseFilters } from "@/lib/filters";
import type { BugRecord } from "@/lib/types";
import { requireUser } from "@/server/auth/session";

export default function BugPage({ params, searchParams }: PageProps<"/sheets/bug/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <BugDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BugDetail({ params, searchParams }: Pick<PageProps<"/sheets/bug/[id]">, "params" | "searchParams">) {
  await requireUser("/sheets");
  const [workbooks, { id }, sp] = await Promise.all([getWorkbooks(), params, searchParams]);
  let f = parseFilters(sp);
  const workbook = pickWorkbook(workbooks, f.wb);
  if (!workbook) notFound();
  const data = await getSheetData(workbook.id);
  if (!data.ok) return <SheetErrorPanel error={data.error} />;

  const record = data.records.find((r) => r.id === id);
  if (!record) notFound();

  // Prev/next walk the list the user came from; if this record isn't in it, walk its own tab.
  const ownTab = { ...parseFilters({}), wb: f.wb, kind: record.kind, tab: record.tabSlug };
  if (f.kind !== record.kind) f = ownTab;
  let list = filterRecords(data.records, f);
  let index = list.findIndex((r) => r.id === id);
  if (index < 0) {
    f = ownTab;
    list = filterRecords(data.records, f);
    index = list.findIndex((r) => r.id === id);
  }
  const query = filtersToQuery(f, { page: 1 });
  const listPage = Math.floor(index / PAGE_SIZE) + 1;
  const backHref = `/sheets${filtersToQuery(f, { page: listPage })}`;
  const prevHref = index > 0 ? `/sheets/bug/${list[index - 1].id}${query}` : undefined;
  const nextHref = index < list.length - 1 ? `/sheets/bug/${list[index + 1].id}${query}` : undefined;

  const isIssue = record.kind === "issue";
  const ref = isIssue ? `Row ${record.row}` : record.testCaseId || `Row ${record.row}`;

  return (
    <article className="space-y-6">
      <KeyNav prev={prevHref} next={nextHref} back={backHref} />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href={backHref}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent"
        >
          Back to list
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted tabular-nums">
            {index + 1} of {list.length}
          </span>
          <NavButton href={prevHref} label="Previous record (left arrow key)">
            Previous
          </NavButton>
          <NavButton href={nextHref} label="Next record (right arrow key)">
            Next
          </NavButton>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <header className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{record.tab}</span>
              <span aria-hidden>/</span>
              <span className="font-medium text-foreground">{record.module || "No module"}</span>
              {record.feature && (
                <>
                  <span aria-hidden>/</span>
                  <span>{record.feature}</span>
                </>
              )}
              <span className="ml-auto font-mono">{ref}</span>
            </div>
            <h1 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{record.title}</h1>
            <dl className="flex flex-wrap gap-x-6 gap-y-3 pt-1 text-xs">
              <Meta label={isIssue ? "Bug status" : "QA status"}>
                <StatusBadge value={record.status} />
              </Meta>
              <Meta label="Dev status">
                <StatusBadge value={record.devStatus} />
              </Meta>
              {record.severity && (
                <Meta label="Severity">
                  <StatusBadge value={record.severity} />
                </Meta>
              )}
              {record.priority && (
                <Meta label="Priority">
                  <StatusBadge value={record.priority} />
                </Meta>
              )}
              {record.developer && <Meta label="Developer">{record.developer}</Meta>}
              {record.devCheck && (
                <Meta label="Dev check">{record.devCheck === "TRUE" ? "Checked" : "Not checked"}</Meta>
              )}
              {record.taskId && <Meta label="Task ID">{record.taskId}</Meta>}
              {record.bugId && <Meta label="Bug ID">{record.bugId}</Meta>}
              {record.sl && <Meta label="SL">{record.sl}</Meta>}
            </dl>
            <AgentCommandBar id={record.id} workbook={workbook.id === workbooks[0].id ? undefined : workbook.id} />
          </header>

          <div className="grid gap-4 xl:grid-cols-2">
            {isIssue ? <IssueBody record={record} /> : <TestCaseBody record={record} />}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
            <span>
              {record.tab}, row {record.row} of <span className="font-medium">{workbook.name}</span>
            </span>
            {workbook.sheetUrl && (
              <a
                href={workbook.sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2 hover:opacity-70"
              >
                Open the sheet
              </a>
            )}
          </footer>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold">
            Reference <span className="font-normal text-muted">({record.media.length})</span>
          </h2>
          <MediaGallery items={record.media} stacked />
          {record.media.some((m) => m.kind === "drive") && (
            <p className="text-xs text-muted">
              Drive files only show if your Google account can see them. If one asks you to sign in or request
              access, use “Open original”.
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}

function IssueBody({ record }: { record: BugRecord }) {
  return (
    <>
      <Card title="Dev remarks">
        <RichText text={record.devRemarks} />
      </Card>
      <Card title="QA remarks">
        <RichText text={record.qaRemarks} />
      </Card>
    </>
  );
}

function TestCaseBody({ record }: { record: BugRecord }) {
  const failed = /^fail/i.test(record.status);
  return (
    <>
      <Card title="Actual result" tone={failed ? "bad" : undefined} wide>
        <RichText text={record.actual} />
      </Card>
      <Card title="Test steps">
        <RichText text={record.steps} />
      </Card>
      <Card title="Expected result">
        <RichText text={record.expected} />
      </Card>
      <Card title="Test data" wide>
        <RichText text={record.testData} />
      </Card>
      <Card title="Dev remarks">
        <RichText text={record.devRemarks} />
      </Card>
      <Card title="QA remarks">
        <RichText text={record.qaRemarks} />
      </Card>
    </>
  );
}

function Card({
  title,
  children,
  tone,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "bad";
  wide?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${wide ? "xl:col-span-2" : ""} ${
        tone === "bad"
          ? "border-red-300 bg-red-50/60"
          : "border-line bg-surface"
      }`}
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function NavButton({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  const cls = "rounded-md border px-3 py-1.5 text-xs font-medium";
  if (!href) return <span className={`${cls} border-line text-muted opacity-50`}>{children}</span>;
  return (
    <Link href={href} title={label} className={`${cls} border-line bg-surface hover:border-accent`}>
      {children}
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-5 w-32 rounded bg-surface-2" />
      <div className="h-36 rounded-xl bg-surface-2" />
      <div className="aspect-video max-h-96 rounded-xl bg-surface-2" />
    </div>
  );
}
