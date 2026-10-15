import * as XLSX from "xlsx";
import { guessTab, type MappedField, type TabMapping, type WorkbookMapping } from "./mapping";
import { classifyLink, extractUrls } from "./media";
import type { BugRecord, MediaLink, TabInfo } from "./types";

/** Columns whose links are shown as reference media. */
const MEDIA_FIELDS: MappedField[] = ["reference", "qaRemarks", "actual", "title", "devRemarks"];

const MAX_COLUMNS = 60;
const PREVIEW_ROWS = 12;
const PREVIEW_CELL_CHARS = 80;
/** Columns with more distinct values than this aren't offered as status choices. */
const MAX_DISTINCT = 40;

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v == null) return "";
  if (typeof cell.v === "boolean") return cell.v ? "TRUE" : "FALSE";
  return String(cell.w ?? cell.v).trim();
}

/** Merged cells only store a value in their top-left cell; copy it down/across. */
function fillMerges(ws: XLSX.WorkSheet) {
  for (const m of ws["!merges"] ?? []) {
    const src = ws[XLSX.utils.encode_cell(m.s)];
    if (!src) continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: src.t, v: src.v, w: src.w };
      }
    }
  }
}

interface Sheet {
  name: string;
  ws: XLSX.WorkSheet;
  range: XLSX.Range;
  grid: string[][];
}

function readSheets(data: Uint8Array): Sheet[] {
  const wb = XLSX.read(data, { type: "array", cellStyles: false, cellHTML: false });
  const sheets: Sheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws?.["!ref"]) continue;
    fillMerges(ws);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const width = Math.min(range.e.c + 1, MAX_COLUMNS);
    const grid: string[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
      grid.push(Array.from({ length: width }, (_, c) => cellText(ws[XLSX.utils.encode_cell({ r, c })])));
    }
    sheets.push({ name, ws, range, grid });
  }
  return sheets;
}

export interface TabAnalysis {
  name: string;
  rowCount: number;
  /** First rows as text, for showing column names and sample values. */
  preview: string[][];
  /** Column index → its distinct values with counts, for columns that look like a status or category. */
  values: Record<number, { value: string; count: number }[]>;
  guess: TabMapping;
}

/** Everything the mapping screen needs to show a workbook's tabs and guess their columns. */
export function analyzeWorkbook(data: Uint8Array): TabAnalysis[] {
  return readSheets(data).map(({ name, grid }) => {
    const guess = guessTab(name, grid);
    const dataRows = grid.slice(guess.headerRow + guess.headerRows);
    const values: TabAnalysis["values"] = {};
    const width = grid[0]?.length ?? 0;
    for (let c = 0; c < width; c++) {
      const counts = new Map<string, { value: string; count: number }>();
      for (const row of dataRows) {
        const v = row[c];
        if (!v) continue;
        const key = v.toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { value: v, count: 1 });
        if (counts.size > MAX_DISTINCT) break;
      }
      if (counts.size > 0 && counts.size <= MAX_DISTINCT) {
        values[c] = [...counts.values()].sort((a, b) => b.count - a.count);
      }
    }
    return {
      name,
      rowCount: grid.length,
      preview: grid
        .slice(0, PREVIEW_ROWS)
        .map((row) => row.map((v) => (v.length > PREVIEW_CELL_CHARS ? `${v.slice(0, PREVIEW_CELL_CHARS)}…` : v))),
      values,
      guess,
    };
  });
}

function emptyRecord(): Omit<BugRecord, "id" | "kind" | "tab" | "tabSlug" | "row"> {
  return {
    module: "", feature: "", title: "", status: "", devStatus: "", severity: "", priority: "",
    devRemarks: "", qaRemarks: "", developer: "", taskId: "", bugId: "", sl: "", testCaseId: "",
    testData: "", steps: "", expected: "", actual: "", devCheck: "", media: [],
  };
}

/**
 * Reads every included tab into records. With a saved mapping, its tabs are used as-is; tabs the
 * mapping doesn't know about (added to the sheet later) and workbooks without a mapping are guessed.
 */
export function parseWorkbook(
  data: Uint8Array,
  mapping?: WorkbookMapping | null,
): { tabs: TabInfo[]; records: BugRecord[] } {
  const tabs: TabInfo[] = [];
  const records: BugRecord[] = [];

  for (const { name: tab, ws, range, grid } of readSheets(data)) {
    const tm = mapping?.tabs.find((t) => t.tab === tab) ?? guessTab(tab, grid);
    if (!tm.include || tm.columns.title === undefined) continue;

    const tabSlug = slugify(tab);
    // Left to right, so a row's references keep the order they appear in the sheet.
    const columns = (Object.entries(tm.columns) as [MappedField, number][]).sort((a, b) => a[1] - b[1]);
    let count = 0;
    let lastModule = "";

    for (let r = tm.headerRow + tm.headerRows; r <= range.e.r; r++) {
      const rec = emptyRecord();
      const media = new Map<string, MediaLink>();
      const addMedia = (url: string, label?: string) => {
        if (!media.has(url)) media.set(url, classifyLink(url, label));
      };

      for (const [field, c] of columns) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const text = cellText(cell);
        if (field !== "reference") rec[field] = text;
        if (MEDIA_FIELDS.includes(field)) {
          const target = cell?.l?.Target;
          // Keep the cell text as a label only when it reads like a filename, not a sentence.
          const label = text && !/https?:|\n/.test(text) && text.length <= 80 ? text : undefined;
          if (target && /^https?:/i.test(target)) addMedia(target, label);
          for (const u of extractUrls(text)) addMedia(u);
        }
      }

      if (!rec.title && !(tm.kind === "testcase" && rec.testCaseId)) continue;
      if (tm.fillDown) rec.module = rec.module || lastModule;
      lastModule = rec.module;

      records.push({
        ...rec,
        id: `${tabSlug}-${r + 1}`,
        kind: tm.kind,
        tab,
        tabSlug,
        row: r + 1,
        media: [...media.values()],
      });
      count++;
    }
    tabs.push({ name: tab, slug: tabSlug, kind: tm.kind, count });
  }

  return { tabs, records };
}
