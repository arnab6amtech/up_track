import "server-only";
import { getSheetData, getWorkbooks, pickWorkbook, type WorkbookSummary } from "../data";
import { makeIsOpen } from "../open";
import { downloadDriveImage } from "../source";
import type { BugRecord, MediaLink, SheetData } from "../types";
import { fail, json, MAX_IMAGE_BYTES, text, type ToolContent, type ToolResult } from "./common";

// Tools over the spreadsheet workbooks (QA sheets read from Excel or Google Sheets).

export async function loadWorkbook(id: string | undefined): Promise<{ workbook: WorkbookSummary; data: SheetData } | { error: string }> {
  const workbooks = await getWorkbooks();
  if (workbooks.length === 0) return { error: "No spreadsheet workbooks are set up in UpTrack." };
  const workbook = pickWorkbook(workbooks, id ?? "");
  if (!workbook) return { error: `Unknown workbook "${id}". Available: ${workbooks.map((w) => w.id).join(", ")}.` };
  const data = await getSheetData(workbook.id);
  if (!data.ok) return { error: `Couldn't read workbook "${workbook.name}": ${data.error}` };
  return { workbook, data };
}

export async function listWorkbooksTool(): Promise<ToolResult> {
  const workbooks = await getWorkbooks();
  return json(workbooks.map((w, i) => ({ id: w.id, name: w.name, source: w.sourceType, default: i === 0 })));
}

const refLabel = (r: BugRecord) => (r.kind === "issue" ? `Row ${r.row}` : r.testCaseId || `Row ${r.row}`);
const contains = (value: string, wanted?: string) => !wanted || value.toLowerCase().includes(wanted.toLowerCase());

export interface SheetSearchArgs {
  workbook: string;
  kind?: "issue" | "testcase";
  open_only?: boolean;
  query?: string;
  tab?: string;
  module?: string;
  feature?: string;
  status?: string;
  dev_status?: string;
  developer?: string;
  severity?: string;
  priority?: string;
  has_reference?: boolean;
  limit?: number;
  offset?: number;
}

export async function searchSheet(args: SheetSearchArgs): Promise<ToolResult> {
  const loaded = await loadWorkbook(args.workbook);
  if ("error" in loaded) return fail(loaded.error);
  const { workbook, data } = loaded;
  const isOpen = makeIsOpen(data.doneValues);
  const terms = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = data.records.filter((r) => {
    if (args.kind && r.kind !== args.kind) return false;
    if (args.open_only && !isOpen(r)) return false;
    if (args.has_reference && r.media.length === 0) return false;
    if (args.tab && !contains(r.tab, args.tab) && r.tabSlug !== args.tab) return false;
    if (!contains(r.module, args.module) || !contains(r.feature, args.feature)) return false;
    if (!contains(r.status, args.status) || !contains(r.devStatus, args.dev_status)) return false;
    if (!contains(r.developer, args.developer)) return false;
    if (!contains(r.severity, args.severity) || !contains(r.priority, args.priority)) return false;
    if (terms.length) {
      const hay = [r.title, r.module, r.feature, r.actual, r.devRemarks, r.qaRemarks, r.testCaseId, r.sl, r.tab].join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  return json({
    workbook: workbook.id,
    total: matches.length,
    offset,
    next_offset: offset + limit < matches.length ? offset + limit : null,
    results: matches.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      kind: r.kind,
      tab: r.tab,
      ref: refLabel(r),
      module: r.module,
      feature: r.feature,
      title: r.title.length > 240 ? `${r.title.slice(0, 240)}…` : r.title,
      status: r.status,
      dev_status: r.devStatus,
      developer: r.developer || undefined,
      severity: r.severity || undefined,
      priority: r.priority || undefined,
      open: isOpen(r),
      references: r.media.length,
    })),
  });
}

function describeKind(m: MediaLink): string {
  if (m.kind === "drive") return m.video ? "Drive video" : "Drive file";
  if (m.kind === "probe") return "File";
  return m.kind[0].toUpperCase() + m.kind.slice(1);
}

export async function getSheetRecord(id: string, workbookId: string, baseUrl: string): Promise<ToolResult> {
  const loaded = await loadWorkbook(workbookId);
  if ("error" in loaded) return fail(loaded.error);
  const { workbook, data } = loaded;
  const r = data.records.find((rec) => rec.id === id);
  if (!r) return fail(`No record "${id}" in workbook "${workbook.id}". Use search_bugs with this workbook to find IDs.`);
  const open = makeIsOpen(data.doneValues)(r);
  const url = `${baseUrl}/sheets/bug/${r.id}?wb=${encodeURIComponent(workbook.id)}${r.kind === "testcase" ? "&kind=testcase" : ""}`;
  const lines = [`# ${r.title}`, ""];
  const meta: [string, string][] = [
    ["ID", r.id],
    ["Workbook", `${workbook.name} (${workbook.id})`],
    ["Tab", `${r.tab}, row ${r.row}`],
    ["Test case", [r.testCaseId, r.sl].filter(Boolean).join(" / ")],
    ["Module", r.module],
    ["Feature", r.feature],
    [r.kind === "issue" ? "Bug status" : "QA status", r.status],
    ["Dev status", r.devStatus],
    ["Still open", open ? "yes" : "no"],
    ["Severity", r.severity],
    ["Priority", r.priority],
    ["Developer", r.developer],
    ["UpTrack page", url],
  ];
  for (const [k, v] of meta) if (v) lines.push(`- **${k}:** ${v}`);
  const sections: [string, string][] = [
    ["Test data", r.testData],
    ["Steps", r.steps],
    ["Expected result", r.expected],
    ["Actual result", r.actual],
    ["Dev remarks", r.devRemarks],
    ["QA remarks", r.qaRemarks],
  ];
  for (const [title, body] of sections) if (body) lines.push("", `## ${title}`, body);
  if (r.media.length) {
    lines.push("", "## References", "Call get_bug_reference to view them.");
    r.media.forEach((m, i) => lines.push(`${i + 1}. ${describeKind(m)}${m.label ? ` "${m.label}"` : ""}: ${m.url}`));
  }
  return text(lines.join("\n"));
}

async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { data: Buffer.from(bytes).toString("base64"), mimeType: type };
  } catch {
    return null;
  }
}

async function referenceContent(m: MediaLink, n: number): Promise<ToolContent[]> {
  const head = `Reference ${n}${m.label ? ` "${m.label}"` : ""} (${m.url})`;
  let image: { data: string; mimeType: string } | null = null;
  if (m.kind === "drive" && m.thumb) {
    image = await fetchImage(m.thumb.replace(/sz=w\d+/, "sz=w1600"));
    if (!image && m.fileId) {
      // Not public: try the app's own Drive access.
      const file = await downloadDriveImage(m.fileId, MAX_IMAGE_BYTES).catch(() => null);
      if (file) image = { data: Buffer.from(file.bytes).toString("base64"), mimeType: file.mimeType };
    }
    if (image) {
      const note = m.video ? " — still frame of a video; open the link to watch it" : "";
      return [{ type: "text", text: `${head}${note}:` }, { type: "image", ...image }];
    }
    return [{ type: "text", text: `${head}: couldn't load it. It may not be shared with UpTrack; ask the user to open the link.` }];
  }
  if (m.kind === "image" || m.kind === "probe") {
    image = await fetchImage(m.src);
    if (image) return [{ type: "text", text: `${head}:` }, { type: "image", ...image }];
  }
  if (m.kind === "video" || m.kind === "probe") {
    return [{ type: "text", text: `${head}: a video, which can't be shown here. Ask the user to watch it if the written report isn't enough.` }];
  }
  return [{ type: "text", text: `${head}: a link, not an image.` }];
}

export async function getSheetReference(id: string, workbookId: string, index?: number): Promise<ToolResult> {
  const loaded = await loadWorkbook(workbookId);
  if ("error" in loaded) return fail(loaded.error);
  const r = loaded.data.records.find((rec) => rec.id === id);
  if (!r) return fail(`No record "${id}" in workbook "${loaded.workbook.id}".`);
  if (r.media.length === 0) return text(`${id} has no reference attached.`);
  if (index && index > r.media.length) return fail(`${id} has only ${r.media.length} reference(s).`);
  const picked = index ? [{ m: r.media[index - 1], n: index }] : r.media.slice(0, 5).map((m, i) => ({ m, n: i + 1 }));
  const content: ToolContent[] = [];
  for (const { m, n } of picked) content.push(...(await referenceContent(m, n)));
  if (!index && r.media.length > 5) content.push({ type: "text", text: `${r.media.length - 5} more reference(s); pass index to see them.` });
  return { content };
}

export async function sheetSummary(workbookId: string): Promise<ToolResult> {
  const loaded = await loadWorkbook(workbookId);
  if ("error" in loaded) return fail(loaded.error);
  const { workbook, data } = loaded;
  const tally = (records: BugRecord[], key: (r: BugRecord) => string) => {
    const counts = new Map<string, number>();
    for (const r of records) counts.set(key(r) || "(blank)", (counts.get(key(r) || "(blank)") ?? 0) + 1);
    return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
  };
  const byKind = (kind: BugRecord["kind"]) => {
    const all = data.records.filter((r) => r.kind === kind);
    const open = all.filter(makeIsOpen(data.doneValues));
    return {
      total: all.length,
      open: open.length,
      open_by_tab: tally(open, (r) => r.tab),
      open_by_module: tally(open, (r) => r.module),
      open_by_developer: tally(open, (r) => r.developer),
      by_status: tally(all, (r) => r.status),
      by_dev_status: tally(all, (r) => r.devStatus),
    };
  };
  return json({ workbook: { id: workbook.id, name: workbook.name }, sheet_edited: data.modifiedTime, issues: byKind("issue"), test_cases: byKind("testcase") });
}
