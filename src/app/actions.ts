"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getWorkbooks, pickWorkbook, WORKBOOKS_TAG, workbookTag } from "@/lib/data";
import { FIELDS, type MappedField, type WorkbookMapping } from "@/lib/mapping";
import { analyzeWorkbook, parseWorkbook, type TabAnalysis } from "@/lib/parse";
import { loadWorkbookFile } from "@/lib/source";
import {
  addWorkbook,
  listWorkbooks,
  newWorkbookId,
  parseDriveLink,
  promotePending,
  readPending,
  removeWorkbook,
  savePending,
  setMapping,
} from "@/lib/workbooks";

/** Drops the cached copy of a workbook so the next render reads it again. */
export async function refreshSheet(wb: string) {
  const workbook = pickWorkbook(await getWorkbooks(), wb);
  if (workbook) updateTag(workbookTag(workbook.id));
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED = /\.(xlsx|xlsm|xls|ods)$/i;

export type ImportSource =
  | { type: "upload"; pending: string; originalName: string }
  | { type: "drive"; fileId: string };

export interface AnalyzeState {
  error?: string;
  result?: { source: ImportSource; suggestedName: string; tabs: TabAnalysis[] };
}

export interface SaveState {
  error?: string;
}

function driveError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return /\(404\)|\(403\)/.test(message)
    ? "Google Drive refused access to that file. Share it with the app's service account (or as “anyone with the link”) and try again."
    : message;
}

/** Step 1 of importing: read the file or link and guess its columns. Nothing is saved as a workbook yet. */
export async function analyzeImport(_prev: AnalyzeState, form: FormData): Promise<AnalyzeState> {
  const mode = form.get("mode");
  try {
    if (mode === "upload") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return { error: "Choose a spreadsheet file to upload." };
      if (!ACCEPTED.test(file.name)) return { error: "Only Excel (.xlsx, .xls) or OpenDocument (.ods) files can be imported." };
      if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is larger than 25 MB." };

      const bytes = new Uint8Array(await file.arrayBuffer());
      const tabs = analyzeWorkbook(bytes);
      if (tabs.length === 0) return { error: "That file has no sheets with data in them." };
      const pending = await savePending(bytes, file.name.match(ACCEPTED)![0]);
      return {
        result: {
          source: { type: "upload", pending, originalName: file.name },
          suggestedName: file.name.replace(ACCEPTED, ""),
          tabs,
        },
      };
    }

    if (mode === "drive") {
      const fileId = parseDriveLink(String(form.get("link") ?? ""));
      if (!fileId) return { error: "That doesn't look like a Google Drive or Sheets link." };
      const existing = (await listWorkbooks()).find((w) => w.source.type === "drive" && w.source.fileId === fileId);
      if (existing) return { error: `This sheet is already imported as “${existing.name}”.` };

      const file = await loadWorkbookFile({ type: "drive", fileId });
      const tabs = analyzeWorkbook(file.bytes);
      if (tabs.length === 0) return { error: "That sheet has no tabs with data in them." };
      return { result: { source: { type: "drive", fileId }, suggestedName: file.title.replace(ACCEPTED, ""), tabs } };
    }

    return { error: "Pick upload or Drive link." };
  } catch (err) {
    return { error: driveError(err) };
  }
}

const fieldKeys = FIELDS.map((f) => f.key) as [MappedField, ...MappedField[]];

const mappingSchema = z.object({
  version: z.literal(1),
  doneValues: z.array(z.string().max(200)).max(500),
  tabs: z
    .array(
      z.object({
        tab: z.string().max(300),
        include: z.boolean(),
        kind: z.enum(["issue", "testcase"]),
        headerRow: z.number().int().min(0).max(100),
        headerRows: z.union([z.literal(1), z.literal(2)]),
        columns: z.partialRecord(z.enum(fieldKeys), z.number().int().min(0).max(500)),
        fillDown: z.boolean(),
      }),
    )
    .max(200),
});

const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upload"), pending: z.string(), originalName: z.string().max(300) }),
  z.object({ type: z.literal("drive"), fileId: z.string().regex(/^[\w-]{10,}$/) }),
]);

/** Parses with the user's mapping and explains what's wrong if nothing comes out. */
function checkMapping(bytes: Uint8Array, mapping: WorkbookMapping): string | null {
  const included = mapping.tabs.filter((t) => t.include);
  if (included.length === 0) return "Include at least one tab.";
  const missing = included.find((t) => t.columns.title === undefined);
  if (missing) return `Pick the title column for “${missing.tab}”, or leave that tab out.`;
  const { records } = parseWorkbook(bytes, mapping);
  if (records.length === 0) return "No rows were found with these columns. Check the header row and title column.";
  return null;
}

function readPayload<T extends z.ZodType>(form: FormData, schema: T): z.infer<T> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(String(form.get("payload") ?? "")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Step 2 of importing: save the workbook with the columns the user confirmed. */
export async function confirmImport(_prev: SaveState, form: FormData): Promise<SaveState> {
  const payload = readPayload(
    form,
    z.object({ source: sourceSchema, name: z.string().max(80), mapping: mappingSchema }),
  );
  if (!payload) return { error: "Something went wrong reading your choices. Please try again." };
  const { source, mapping } = payload;
  const name = payload.name.trim() || "Untitled sheet";
  const id = newWorkbookId(name);

  try {
    if (source.type === "upload") {
      const bytes = await readPending(source.pending);
      if (!bytes) return { error: "That upload has expired. Please start over and upload the file again." };
      const problem = checkMapping(bytes, mapping);
      if (problem) return { error: problem };
      const file = `${id}${source.pending.match(ACCEPTED)![0]}`;
      await promotePending(source.pending, file);
      await addWorkbook({ id, name, source: { type: "upload", file, originalName: source.originalName } });
    } else {
      const file = await loadWorkbookFile({ type: "drive", fileId: source.fileId });
      const problem = checkMapping(file.bytes, mapping);
      if (problem) return { error: problem };
      await addWorkbook({ id, name, source: { type: "drive", fileId: source.fileId } });
    }
    await setMapping(id, mapping);
  } catch (err) {
    return { error: driveError(err) };
  }

  updateTag(WORKBOOKS_TAG);
  redirect(`/?wb=${encodeURIComponent(id)}`);
}

/** Saves edited columns for an existing workbook. */
export async function saveColumns(_prev: SaveState, form: FormData): Promise<SaveState> {
  const payload = readPayload(form, z.object({ id: z.string().max(100), mapping: mappingSchema }));
  if (!payload) return { error: "Something went wrong reading your choices. Please try again." };
  const workbooks = await listWorkbooks();
  const workbook = workbooks.find((w) => w.id === payload.id);
  if (!workbook) return { error: "That workbook no longer exists." };
  if (workbook.source.type === "captures") return { error: "Reported bugs have no columns to map." };

  try {
    const file = await loadWorkbookFile(workbook.source);
    const problem = checkMapping(file.bytes, payload.mapping);
    if (problem) return { error: problem };
    await setMapping(workbook.id, payload.mapping);
  } catch (err) {
    return { error: driveError(err) };
  }

  updateTag(workbookTag(workbook.id));
  redirect(workbook.id === workbooks[0]?.id ? "/" : `/?wb=${encodeURIComponent(workbook.id)}`);
}

export async function deleteWorkbook(id: string): Promise<SaveState> {
  try {
    await removeWorkbook(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  updateTag(WORKBOOKS_TAG);
  updateTag(workbookTag(id));
  return {};
}
