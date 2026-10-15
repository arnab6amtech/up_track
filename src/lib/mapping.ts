import type { RecordKind } from "./types";

/** Record fields a sheet column can feed, plus "reference" (links shown as screenshots/videos only). */
export type MappedField =
  | "title"
  | "status"
  | "devStatus"
  | "module"
  | "feature"
  | "severity"
  | "priority"
  | "developer"
  | "reference"
  | "devRemarks"
  | "qaRemarks"
  | "steps"
  | "expected"
  | "actual"
  | "testData"
  | "testCaseId"
  | "bugId"
  | "taskId"
  | "sl"
  | "devCheck";

export interface TabMapping {
  tab: string;
  include: boolean;
  kind: RecordKind;
  /** 0-based row holding the column names. */
  headerRow: number;
  /** 2 when the next row adds more column names (e.g. a second line with Severity / Priority). */
  headerRows: 1 | 2;
  /** Field → 0-based column index. */
  columns: Partial<Record<MappedField, number>>;
  /** Fill blank Module cells from the row above, for sheets that name the module once per section. */
  fillDown: boolean;
}

export interface WorkbookMapping {
  version: 1;
  tabs: TabMapping[];
  /** Status / dev status values meaning "no more work needed", compared case-insensitively. */
  doneValues: string[];
}

export interface FieldInfo {
  key: MappedField;
  label: string;
  /** Shown under "More fields" in the mapping screen. */
  secondary?: boolean;
  patterns: RegExp[];
}

/**
 * Column names each field is recognised by, tested against the lowercased header with punctuation
 * turned into spaces. Order matters: earlier fields claim a column first, and each column is used once.
 */
export const FIELDS: FieldInfo[] = [
  { key: "testCaseId", label: "Test case ID", patterns: [/^(test ?case|tc) ?(id|no|number|#)$/, /^case ?id$/] },
  {
    key: "bugId",
    label: "Bug ID",
    secondary: true,
    patterns: [/^(bug|issue|defect|ticket) ?(id|no|number|key|#)$/, /^(id|key|ticket)$/],
  },
  { key: "taskId", label: "Task ID", secondary: true, patterns: [/^task ?(id|no|number)?$/] },
  {
    key: "title",
    label: "Title / description",
    patterns: [
      /^(bug|issue|defect) ?(details|description|summary|title)$/,
      /^(title|summary|subject|scenario|test scenario)$/,
      /^test ?case ?desc/,
      /^test ?case( name| title)?$/,
      /^(description|details|bug|issue|defect|problem)$/,
    ],
  },
  { key: "devStatus", label: "Dev status", patterns: [/^(dev|developer|fix|development) ?status$/, /^resolution$/] },
  {
    key: "status",
    label: "QA status",
    patterns: [/^((bug|issue|qa|test|initial|current) )?status$/, /^(result|test result|qa result|state)$/],
  },
  { key: "severity", label: "Severity", patterns: [/^(severity|criticality|bug ?criticality|impact)$/] },
  { key: "priority", label: "Priority", patterns: [/^priority$/] },
  {
    key: "module",
    label: "Module",
    patterns: [/^(module|module name|component|area|section|page|screen|epic|category)$/],
  },
  {
    key: "feature",
    label: "Feature",
    patterns: [/^(feature|feature name|sub ?module|function|functionality|sub ?feature)$/],
  },
  {
    key: "developer",
    label: "Developer / assignee",
    patterns: [/^(developer|assignee|assigned ?to|owner|dev|dev name|responsible|fixed by)$/],
  },
  {
    key: "reference",
    label: "Screenshot / reference",
    patterns: [
      /^(reference|references|screenshot|screenshots|screen ?shot|attachment|attachments|evidence|link|links|media|proof|video|recording|image|images)$/,
    ],
  },
  { key: "devCheck", label: "Dev check", secondary: true, patterns: [/^dev ?check(ed)?$/] },
  {
    key: "devRemarks",
    label: "Dev remarks",
    patterns: [/^(dev|developer) ?(remarks|comments?|notes)$/, /^(remarks|fix notes|resolution notes)$/],
  },
  {
    key: "qaRemarks",
    label: "QA remarks",
    patterns: [/^(qa|tester|test) ?(remarks|reamarks|comments?|notes)$/, /^(comments?|notes)$/],
  },
  {
    key: "steps",
    label: "Steps",
    patterns: [/^(test )?steps/, /^(steps to reproduce|repro steps|how to reproduce|reproduce)$/],
  },
  { key: "expected", label: "Expected result", patterns: [/^expected/] },
  { key: "actual", label: "Actual result", patterns: [/^actual/] },
  { key: "testData", label: "Test data", secondary: true, patterns: [/^test ?data$/] },
  { key: "sl", label: "Serial no.", secondary: true, patterns: [/^(sl|sn|s no|sr no|serial|serial no|no|#)$/] },
];

export const normHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();

const fieldFor = (header: string): MappedField | undefined =>
  header ? FIELDS.find((f) => f.patterns.some((p) => p.test(header)))?.key : undefined;

/** Column names for a header row, merging in a second header row where the first is blank. */
export function headerCells(grid: string[][], headerRow: number, headerRows: 1 | 2): string[] {
  const first = grid[headerRow] ?? [];
  const second = headerRows === 2 ? (grid[headerRow + 1] ?? []) : [];
  const width = Math.max(first.length, second.length);
  return Array.from({ length: width }, (_, c) => (second[c]?.trim() || first[c]?.trim() || ""));
}

/** Guesses which column feeds which field from the column names alone. */
export function guessColumns(headers: string[]): Partial<Record<MappedField, number>> {
  const columns: Partial<Record<MappedField, number>> = {};
  const taken = new Set<number>();
  const normalized = headers.map(normHeader);
  for (const field of FIELDS) {
    for (const pattern of field.patterns) {
      const c = normalized.findIndex((h, i) => !taken.has(i) && h && pattern.test(h));
      if (c >= 0) {
        columns[field.key] = c;
        taken.add(c);
        break;
      }
    }
  }
  // A common layout leaves the column right after Dev Status unnamed and uses it for the dev's notes.
  const dev = columns.devStatus;
  if (
    columns.devRemarks === undefined &&
    dev !== undefined &&
    dev + 1 < headers.length &&
    !normalized[dev + 1] &&
    !taken.has(dev + 1)
  ) {
    columns.devRemarks = dev + 1;
  }
  return columns;
}

const matchCount = (row: string[] = []) => new Set(row.map((c) => fieldFor(normHeader(c))).filter(Boolean)).size;

/** A second header row only holds column names: every filled cell is a known name or repeats the row above. */
function isSecondHeaderRow(first: string[] = [], second: string[] = []): boolean {
  const filled = second.map((c, i) => [c.trim(), i] as const).filter(([c]) => c);
  if (matchCount(second) < 2) return false;
  return filled.every(([c, i]) => fieldFor(normHeader(c)) || normHeader(c) === normHeader(first[i] ?? ""));
}

/** Test cases have an ID column or a title named like one; bug reports often have Expected/Actual too. */
export function guessKind(columns: Partial<Record<MappedField, number>>, headers: string[]): RecordKind {
  if (columns.testCaseId !== undefined) return "testcase";
  const title = columns.title === undefined ? "" : normHeader(headers[columns.title] ?? "");
  return /test|scenario/.test(title) ? "testcase" : "issue";
}

/** Best guess for a whole tab, from its first rows (header detection) and all rows (fill-down). */
export function guessTab(tab: string, grid: string[][]): TabMapping {
  let headerRow = 0;
  let best = -1;
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const score = matchCount(grid[r]);
    if (score > best) {
      best = score;
      headerRow = r;
    }
  }
  const headerRows: 1 | 2 = isSecondHeaderRow(grid[headerRow], grid[headerRow + 1]) ? 2 : 1;
  const headers = headerCells(grid, headerRow, headerRows);
  const columns = guessColumns(headers);
  const kind = guessKind(columns, headers);

  // Sheets that name the module once per section leave the cells below it blank.
  let fillDown = false;
  const titleCol = columns.title;
  const moduleCol = columns.module;
  if (titleCol !== undefined && moduleCol !== undefined) {
    const rows = grid.slice(headerRow + headerRows).filter((r) => r[titleCol]?.trim());
    const blank = rows.filter((r) => !r[moduleCol]?.trim()).length;
    fillDown = blank > 0 && blank < rows.length;
  }

  return {
    tab,
    include: best >= 2 && titleCol !== undefined,
    kind,
    headerRow,
    headerRows,
    columns,
    fillDown,
  };
}

/** Status words that usually mean nobody needs to work on the bug any more. */
export const DONE_RE =
  /^(pass(ed)?|solved|fixed|done|closed|resolved|complete(d)?|verified|skip(ped)?|won'?t ?fix|not a bug|not valid|not reproducible|invalid|duplicate|next release|improvement|on ?test|ready for (qa|test)|deferred|rejected|cancell?ed)$/i;

export const isLikelyDone = (value: string) => DONE_RE.test(value.trim());

/** "A", "B", … "AA" — spreadsheet column letters. */
export function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
