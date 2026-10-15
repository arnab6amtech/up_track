import type { BugRecord, RecordKind } from "./types";

export interface Filters {
  /** Workbook id; empty means the first (default) workbook. */
  wb: string;
  kind: RecordKind;
  tab: string;
  q: string;
  module: string;
  status: string;
  dev: string;
  developer: string;
  sev: string;
  prio: string;
  media: boolean;
  order: "asc" | "desc";
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

export function parseFilters(params: RawParams): Filters {
  const get = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  return {
    wb: get("wb"),
    kind: get("kind") === "testcase" ? "testcase" : "issue",
    tab: get("tab"),
    q: get("q"),
    module: get("module"),
    status: get("status"),
    dev: get("dev"),
    developer: get("developer"),
    sev: get("sev"),
    prio: get("prio"),
    media: get("media") === "1",
    order: get("order") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number.parseInt(get("page"), 10) || 1),
  };
}

/** Query string for the given filters, dropping defaults so URLs stay short. */
export function filtersToQuery(f: Filters, overrides: Partial<Filters> = {}): string {
  const merged = { ...f, ...overrides };
  const qs = new URLSearchParams();
  if (merged.wb) qs.set("wb", merged.wb);
  if (merged.kind !== "issue") qs.set("kind", merged.kind);
  for (const k of ["tab", "q", "module", "status", "dev", "developer", "sev", "prio"] as const) {
    if (merged[k]) qs.set(k, merged[k]);
  }
  if (merged.media) qs.set("media", "1");
  if (merged.order === "desc") qs.set("order", "desc");
  if (merged.page > 1) qs.set("page", String(merged.page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const BLANK = "(blank)";
const matches = (value: string, wanted: string) =>
  !wanted || (wanted === BLANK ? !value : value.toLowerCase() === wanted.toLowerCase());

const SEARCH_FIELDS: (keyof BugRecord)[] = [
  "title", "module", "feature", "actual", "devRemarks", "qaRemarks",
  "developer", "testCaseId", "sl", "bugId", "taskId", "tab",
];

/** Records of the selected kind/tab only — the base set the dropdown options are built from. */
export function scopeRecords(records: BugRecord[], f: Filters): BugRecord[] {
  return records.filter((r) => r.kind === f.kind && (!f.tab || r.tabSlug === f.tab));
}

export function filterRecords(records: BugRecord[], f: Filters): BugRecord[] {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = scopeRecords(records, f).filter((r) => {
    if (!matches(r.module, f.module)) return false;
    if (!matches(r.status, f.status)) return false;
    if (!matches(r.devStatus, f.dev)) return false;
    if (!matches(r.developer, f.developer)) return false;
    if (!matches(r.severity, f.sev)) return false;
    if (!matches(r.priority, f.prio)) return false;
    if (f.media && r.media.length === 0) return false;
    if (terms.length) {
      const hay = SEARCH_FIELDS.map((k) => r[k]).join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  return f.order === "desc" ? out.reverse() : out;
}

export interface FacetOption {
  value: string;
  count: number;
}

/** Distinct values (case-insensitive) with counts, most frequent first; blanks last. */
export function facet(records: BugRecord[], field: keyof BugRecord): FacetOption[] {
  const counts = new Map<string, { value: string; count: number }>();
  let blanks = 0;
  for (const r of records) {
    const v = String(r[field]).trim();
    if (!v) {
      blanks++;
      continue;
    }
    const key = v.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { value: v, count: 1 });
  }
  const options = [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  if (blanks && options.length) options.push({ value: BLANK, count: blanks });
  return options;
}

export const PAGE_SIZE = 50;
