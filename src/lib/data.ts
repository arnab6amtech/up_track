import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CAPTURES_TAB_SLUG, CAPTURES_WORKBOOK_NAME } from "./capture-types";
import { captureToRecord, listCaptures } from "./captures";
import { parseWorkbook } from "./parse";
import { loadWorkbookFile } from "./source";
import type { SheetData, SheetError } from "./types";
import { getMapping, listWorkbooks, sheetUrl } from "./workbooks";

export const WORKBOOKS_TAG = "workbooks";
export const workbookTag = (id: string) => `workbook-${id}`;

export interface WorkbookSummary {
  id: string;
  name: string;
  sourceType: "drive" | "upload" | "local" | "captures";
  builtIn: boolean;
  createdAt: string | null;
  sheetUrl: string | null;
}

/**
 * The workbook registry. Import/remove actions bust this tag right away; the short lifetime also
 * picks up changes made outside the app (another server instance, or the files edited by hand).
 */
export async function getWorkbooks(): Promise<WorkbookSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(WORKBOOKS_TAG);
  return (await listWorkbooks()).map((w) => ({
    id: w.id,
    name: w.name,
    sourceType: w.source.type,
    builtIn: w.builtIn,
    createdAt: w.createdAt,
    sheetUrl: sheetUrl(w),
  }));
}

/** The workbook a `wb` URL value points to; empty means the first one. */
export function pickWorkbook(workbooks: WorkbookSummary[], wb: string): WorkbookSummary | undefined {
  return wb ? workbooks.find((w) => w.id === wb) : workbooks[0];
}

/** Downloads and parses one workbook. Cached for about a minute; the Refresh button busts it. */
export async function getSheetData(id: string): Promise<SheetData | SheetError> {
  "use cache";
  cacheLife("minutes");
  cacheTag(workbookTag(id));

  const fetchedAt = new Date().toISOString();
  try {
    const workbook = (await listWorkbooks()).find((w) => w.id === id);
    if (!workbook) throw new Error("This workbook no longer exists. It may have been removed.");
    if (workbook.source.type === "captures") {
      const captures = await listCaptures();
      return {
        ok: true,
        title: CAPTURES_WORKBOOK_NAME,
        modifiedTime: captures.at(-1)?.createdAt ?? null,
        source: "Browser extension",
        fetchedAt,
        tabs: [{ name: CAPTURES_WORKBOOK_NAME, slug: CAPTURES_TAB_SLUG, kind: "issue", count: captures.length }],
        records: captures.map(captureToRecord),
        doneValues: null,
      };
    }
    const [file, mapping] = await Promise.all([loadWorkbookFile(workbook.source), getMapping(workbook.id)]);
    const { tabs, records } = parseWorkbook(file.bytes, mapping);
    return {
      ok: true,
      title: file.title,
      modifiedTime: file.modifiedTime,
      source: file.source,
      fetchedAt,
      tabs,
      records,
      doneValues: mapping?.doneValues ?? null,
    };
  } catch (err) {
    // Returned rather than thrown so a missing credential doesn't fail the build's prerender.
    return { ok: false, error: err instanceof Error ? err.message : String(err), fetchedAt };
  }
}
