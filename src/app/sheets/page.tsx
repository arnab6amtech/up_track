import Link from "next/link";
import { Suspense } from "react";
import { FilterBar, type FilterField } from "@/components/filter-bar";
import { LocalTime } from "@/components/local-time";
import { CopyFixButton } from "@/components/agent-command";
import { ReferenceButton } from "@/components/reference-drawer";
import { SheetErrorPanel } from "@/components/sheet-error";
import { StatusBadge } from "@/components/status-badge";
import { getSheetData, getWorkbooks, pickWorkbook } from "@/lib/data";
import {
  facet,
  filterRecords,
  filtersToQuery,
  PAGE_SIZE,
  parseFilters,
  scopeRecords,
  type Filters,
} from "@/lib/filters";
import type { BugRecord } from "@/lib/types";
import { requireUser } from "@/server/auth/session";

export default function Home({ searchParams }: PageProps<"/sheets">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <BugList searchParams={searchParams} />
    </Suspense>
  );
}

async function BugList({ searchParams }: { searchParams: PageProps<"/sheets">["searchParams"] }) {
  await requireUser("/sheets");
  const [workbooks, params] = await Promise.all([getWorkbooks(), searchParams]);
  const f = parseFilters(params);
  if (workbooks.length === 0) return <NoWorkbooks />;
  const workbook = pickWorkbook(workbooks, f.wb);
  if (!workbook) return <SheetErrorPanel error="This workbook doesn't exist. It may have been removed." />;
  const data = await getSheetData(workbook.id);
  if (!data.ok) return <SheetErrorPanel error={data.error} />;

  const isIssue = f.kind === "issue";
  const scoped = scopeRecords(data.records, f);
  const results = filterRecords(data.records, f);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detailQuery = filtersToQuery(f, { page: 1 });
  // The fix-bug prompt defaults to the main workbook, so only name other workbooks in the command.
  const agentWorkbook = workbook.id === workbooks[0].id ? undefined : workbook.id;

  const kindCount = (kind: Filters["kind"]) => data.records.filter((r) => r.kind === kind).length;
  const tabs = data.tabs.filter((t) => t.kind === f.kind);
  const fields: FilterField[] = [
    { key: "module", label: "Module", options: facet(scoped, "module") },
    { key: "status", label: isIssue ? "Bug status" : "QA status", options: facet(scoped, "status") },
    { key: "dev", label: "Dev status", options: facet(scoped, "devStatus") },
    { key: "developer", label: "Developer", options: facet(scoped, "developer") },
    { key: "sev", label: "Severity", options: facet(scoped, "severity") },
    { key: "prio", label: "Priority", options: facet(scoped, "priority") },
  ];
  const statusSummary = facet(results, "status");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted">
            <span className="font-medium text-foreground">{workbook.name}</span> · {data.source}
            {data.modifiedTime && (
              <>
                {" · edited "}
                <LocalTime iso={data.modifiedTime} />
              </>
            )}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{isIssue ? "Issues" : "Test cases"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isIssue
              ? "Bugs QA logged in the issue tabs, with their reference screenshots and videos."
              : "Every test case run by QA. Filter QA status to Fail to see the bugs."}
          </p>
        </div>
        <nav className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Record type">
          {(["issue", "testcase"] as const).map((kind) => (
            <Link
              key={kind}
              href={`/sheets${filtersToQuery({ ...f, kind, tab: "" }, { page: 1, module: "", status: "", dev: "", developer: "", sev: "", prio: "" })}`}
              className={`rounded-md px-3 py-1.5 font-medium ${
                f.kind === kind ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {kind === "issue" ? "Issues" : "Test cases"}
              <span className="ml-1.5 text-xs opacity-75">{kindCount(kind).toLocaleString()}</span>
            </Link>
          ))}
        </nav>
      </div>

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Sheet tabs">
        {[{ slug: "", name: "All tabs", count: kindCount(f.kind) }, ...tabs].map((t) => (
          <Link
            key={t.slug || "all"}
            href={`/sheets${filtersToQuery(f, { tab: t.slug, page: 1, module: "" })}`}
            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              f.tab === t.slug
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-muted hover:border-neutral-400 hover:text-foreground"
            }`}
          >
            {t.name} <span className="opacity-70">{t.count}</span>
          </Link>
        ))}
      </nav>

      <FilterBar filters={f} fields={fields} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-medium">
          {results.length.toLocaleString()} {results.length === 1 ? "result" : "results"}
        </span>
        {statusSummary.length > 1 &&
          statusSummary.map((s) => (
            <Link key={s.value} href={`/sheets${filtersToQuery(f, { status: s.value, page: 1 })}`} className="hover:opacity-80">
              <StatusBadge value={s.value} /> <span className="text-xs text-muted">{s.count}</span>
            </Link>
          ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center text-sm text-muted">
          Nothing matches these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div
            className={`hidden gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted md:grid ${
              isIssue ? ISSUE_GRID : TESTCASE_GRID
            }`}
          >
            <span>{isIssue ? "Row" : "TC ID"}</span>
            <span>Module / Feature</span>
            <span>{isIssue ? "Bug details" : "Test case"}</span>
            {!isIssue && <span>Sev.</span>}
            <span>{isIssue ? "Bug status" : "QA status"}</span>
            <span>Dev status</span>
            <span className="text-right">Reference</span>
            <span className="text-right">Agent</span>
          </div>
          <ul className="divide-y divide-line">
            {visible.map((r) => (
              <li key={r.id}>
                <Row record={r} href={`/sheets/bug/${r.id}${detailQuery}`} showTab={!f.tab} agentWorkbook={agentWorkbook} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
          <span className="text-xs text-muted">
            Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min(page * PAGE_SIZE, results.length).toLocaleString()} of {results.length.toLocaleString()}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <PageLink f={f} page={page - 1} disabled={page <= 1}>
              Previous
            </PageLink>
            {pageItems(page, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1.5 text-muted">
                  …
                </span>
              ) : (
                <PageLink key={p} f={f} page={p} current={p === page}>
                  {p}
                </PageLink>
              ),
            )}
            <PageLink f={f} page={page + 1} disabled={page >= pages}>
              Next
            </PageLink>
          </div>
        </nav>
      )}
    </div>
  );
}

const ISSUE_GRID = "md:grid-cols-[4.5rem_12rem_1fr_7rem_7rem_7rem_4rem]";
const TESTCASE_GRID = "md:grid-cols-[5.5rem_12rem_1fr_4rem_7rem_7rem_7rem_4rem]";

function Row({
  record: r,
  href,
  showTab,
  agentWorkbook,
}: {
  record: BugRecord;
  href: string;
  showTab: boolean;
  agentWorkbook?: string;
}) {
  const isIssue = r.kind === "issue";
  const ref = isIssue ? `#${r.row}` : r.testCaseId || `#${r.row}`;
  const reference = <ReferenceButton media={r.media} title={r.title} refLabel={ref} href={href} />;
  const fix = <CopyFixButton id={r.id} workbook={agentWorkbook} />;
  // The whole row is clickable via the title link's ::after overlay; the reference button sits above it.
  return (
    <div
      className={`relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 text-sm hover:bg-surface-2 md:items-center md:gap-y-0 ${
        isIssue ? ISSUE_GRID : TESTCASE_GRID
      }`}
    >
      <span className="font-mono text-xs text-muted">{ref}</span>
      <span className="text-right md:hidden">
        <StatusBadge value={r.status} />
      </span>
      <span className="col-span-2 min-w-0 text-xs md:col-span-1">
        {showTab && <span className="block truncate text-muted">{r.tab}</span>}
        <span className="block truncate font-medium">{r.module || "—"}</span>
        {r.feature && <span className="block truncate text-muted">{r.feature}</span>}
      </span>
      <Link
        href={href}
        className="col-span-2 line-clamp-2 min-w-0 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-accent focus-visible:after:ring-inset md:col-span-1"
      >
        {r.title}
      </Link>
      {!isIssue && (
        <span className="hidden md:block">
          <StatusBadge value={r.severity} />
        </span>
      )}
      <span className="hidden md:block">
        <StatusBadge value={r.status} />
      </span>
      <span className="col-span-2 flex items-center gap-2 md:col-span-1 md:block">
        <span className="text-xs text-muted md:hidden">Dev:</span>
        <StatusBadge value={r.devStatus} />
        {r.developer && <span className="block truncate text-xs text-muted md:mt-0.5">{r.developer}</span>}
        <span className="ml-auto flex items-center gap-2 md:hidden">
          {reference}
          {fix}
        </span>
      </span>
      <span className="hidden text-right md:block">{reference}</span>
      <span className="hidden text-right md:block">{fix}</span>
    </div>
  );
}

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageItems(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4].forEach((p) => p <= pages && keep.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((p) => p >= 1 && keep.add(p));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

function PageLink({
  f,
  page,
  disabled,
  current,
  children,
}: {
  f: Filters;
  page: number;
  disabled?: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  const base = "inline-grid h-8 min-w-8 place-items-center rounded-md border px-2.5 text-xs font-medium tabular-nums";
  if (disabled) return <span className={`${base} border-line text-muted opacity-50`}>{children}</span>;
  if (current)
    return (
      <span aria-current="page" className={`${base} border-accent bg-accent text-white`}>
        {children}
      </span>
    );
  return (
    <Link href={`/sheets${filtersToQuery(f, { page })}`} className={`${base} border-line bg-surface hover:border-accent`}>
      {children}
    </Link>
  );
}

function NoWorkbooks() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-line px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">No sheet yet</h1>
      <p className="mt-2 text-sm text-muted">Import QA&apos;s workbook to see its issues and test cases here.</p>
      <Link
        href="/sheets/import"
        className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Import sheet
      </Link>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-48 rounded bg-surface-2" />
      <div className="h-7 w-full rounded bg-surface-2" />
      <div className="h-10 w-full rounded bg-surface-2" />
      <div className="space-y-px overflow-hidden rounded-xl border border-line">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-14 bg-surface" />
        ))}
      </div>
    </div>
  );
}
