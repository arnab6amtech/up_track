import "server-only";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeUserAgent, isFailed, type NetworkEntry } from "../capture-types";
import { captureFilePath, getCapture, readCaptureLog } from "../captures";
import { getSheetData, getWorkbooks, pickWorkbook, type WorkbookSummary } from "../data";
import { makeIsOpen } from "../open";
import { downloadDriveImage } from "../source";
import type { BugRecord, MediaLink, SheetData } from "../types";

const INSTRUCTIONS = `UpTrack holds the QA team's bug reports for this product, read from their test case workbook.
- "Issues" are bugs QA logged directly; "test cases" are QA's planned checks, and a failed test case is also a bug.
- Use search_bugs to find work (open_only=true for bugs that still need a developer), get_bug for the full report, and get_bug_reference to see QA's screenshots before changing UI code.
- Record IDs look like "bugs-17" (sheet tab name + row number) and belong to one workbook; pass the same workbook you found them in.
- Bugs in the "reported" workbook were captured with the UpTrack browser extension. get_bug shows their page, browser and failed API calls; get_bug_logs has the full request/response details and console errors, which often point straight at the cause.
- This server is read-only: tell the user what to write in the sheet's Dev Status / Dev Remarks rather than claiming you updated it.`;

const MAX_IMAGE_BYTES = 4_500_000;
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2));
const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });

const workbookArg = z
  .string()
  .optional()
  .describe("Workbook ID from list_workbooks. Defaults to the main workbook.");

async function loadWorkbook(
  id: string | undefined,
): Promise<{ workbook: WorkbookSummary; data: SheetData } | { error: string }> {
  const workbooks = await getWorkbooks();
  if (workbooks.length === 0) return { error: "No workbooks are set up in UpTrack yet." };
  const workbook = pickWorkbook(workbooks, id ?? "");
  if (!workbook) {
    return { error: `Unknown workbook "${id}". Available: ${workbooks.map((w) => w.id).join(", ")}.` };
  }
  const data = await getSheetData(workbook.id);
  if (!data.ok) return { error: `Couldn't read workbook "${workbook.name}": ${data.error}` };
  return { workbook, data };
}

const refLabel = (r: BugRecord) => (r.kind === "issue" ? `Row ${r.row}` : r.testCaseId || `Row ${r.row}`);
const contains = (value: string, wanted?: string) => !wanted || value.toLowerCase().includes(wanted.toLowerCase());

export function createMcpServer({ baseUrl, caller }: { baseUrl: string; caller: string }) {
  const server = new McpServer({ name: "uptrack", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  const pageUrl = (workbook: WorkbookSummary, r: BugRecord) =>
    `${baseUrl}/bug/${r.id}?wb=${encodeURIComponent(workbook.id)}${r.kind === "testcase" ? "&kind=testcase" : ""}`;

  const log = (tool: string, args: unknown) => console.info(`[mcp] ${caller} → ${tool} ${JSON.stringify(args)}`);

  server.registerTool(
    "list_workbooks",
    {
      title: "List workbooks",
      description: "Lists the QA workbooks in UpTrack (one per product version or project). The first one is the default.",
      annotations: READ_ONLY,
    },
    async () => {
      log("list_workbooks", {});
      const workbooks = await getWorkbooks();
      return json(
        workbooks.map((w, i) => ({ id: w.id, name: w.name, source: w.sourceType, default: i === 0 })),
      );
    },
  );

  server.registerTool(
    "search_bugs",
    {
      title: "Search bugs",
      description:
        "Finds QA issues and test cases. Text filters match case-insensitively on part of the value. Returns compact rows; use get_bug for the full report.",
      inputSchema: {
        workbook: workbookArg,
        kind: z
          .enum(["issue", "testcase"])
          .optional()
          .describe("issue = bugs QA logged; testcase = QA test cases. Both if omitted."),
        open_only: z
          .boolean()
          .optional()
          .describe("Only records that still need developer work (failed/reopened and not yet solved)."),
        query: z.string().optional().describe("Words to find in the title, remarks, module, feature or IDs."),
        tab: z.string().optional().describe("Sheet tab name, or part of it."),
        module: z.string().optional(),
        feature: z.string().optional(),
        status: z.string().optional().describe("QA status, e.g. Fail, Pass, Skip, Re Open."),
        dev_status: z.string().optional().describe("Developer status, e.g. Solved, Skip, Next Release."),
        developer: z.string().optional(),
        severity: z.string().optional(),
        priority: z.string().optional(),
        has_reference: z.boolean().optional().describe("Only records with a screenshot or video attached."),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      log("search_bugs", args);
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
          const hay = [r.title, r.description ?? "", r.module, r.feature, r.actual, r.devRemarks, r.qaRemarks, r.testCaseId, r.sl, r.tab]
            .join(" ")
            .toLowerCase();
          if (!terms.every((t) => hay.includes(t))) return false;
        }
        return true;
      });

      const limit = args.limit ?? 20;
      const offset = args.offset ?? 0;
      const page = matches.slice(offset, offset + limit);
      return json({
        workbook: workbook.id,
        total: matches.length,
        offset,
        next_offset: offset + limit < matches.length ? offset + limit : null,
        results: page.map((r) => ({
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
    },
  );

  server.registerTool(
    "get_bug",
    {
      title: "Get bug",
      description:
        "Full report for one issue or test case: steps, expected and actual result, remarks, statuses, and its reference links. Call get_bug_reference to see the screenshots.",
      inputSchema: {
        id: z.string().describe('Record ID from search_bugs, e.g. "bugs-17".'),
        workbook: workbookArg,
      },
      annotations: READ_ONLY,
    },
    async ({ id, workbook: wb }) => {
      log("get_bug", { id, workbook: wb });
      const loaded = await loadWorkbook(wb);
      if ("error" in loaded) return fail(loaded.error);
      const { workbook, data } = loaded;
      const r = data.records.find((rec) => rec.id === id);
      if (!r) return fail(`No record "${id}" in workbook "${workbook.id}". Use search_bugs to find IDs.`);
      const report = formatBug(r, workbook, pageUrl(workbook, r), makeIsOpen(data.doneValues)(r), baseUrl);
      return text(r.capture ? `${report}\n\n${await captureSummary(r.capture.id, baseUrl)}` : report);
    },
  );

  server.registerTool(
    "get_bug_logs",
    {
      title: "Get bug API log",
      description:
        "For bugs reported with the browser extension: the API calls the page made (method, URL, status, timing, headers, request and response bodies) and its console errors. Secrets in headers and bodies were hidden before upload.",
      inputSchema: {
        id: z.string().describe('Record ID of a reported bug, e.g. "reported-3".'),
        workbook: workbookArg,
        failed_only: z.boolean().optional().describe("Only calls that failed (network error or HTTP 4xx/5xx)."),
        url_contains: z.string().optional().describe("Only calls whose URL contains this text."),
        include_bodies: z.boolean().optional().describe("Include request/response bodies. Default true."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
      annotations: READ_ONLY,
    },
    async ({ id, workbook: wb, failed_only, url_contains, include_bodies = true, limit = 50 }) => {
      log("get_bug_logs", { id, workbook: wb, failed_only, url_contains });
      const loaded = await loadWorkbook(wb);
      if ("error" in loaded) return fail(loaded.error);
      const r = loaded.data.records.find((rec) => rec.id === id);
      if (!r) return fail(`No record "${id}" in workbook "${loaded.workbook.id}".`);
      if (!r.capture) return fail(`${id} wasn't reported with the browser extension, so it has no API log.`);

      const { network, console: consoleEntries } = await readCaptureLog(r.capture.id);
      const needle = url_contains?.toLowerCase();
      const calls = network.filter((e) => (!failed_only || isFailed(e)) && (!needle || e.url.toLowerCase().includes(needle)));
      return json({
        total_calls: network.length,
        matching_calls: calls.length,
        calls: calls.slice(0, limit).map((e) =>
          include_bodies ? e : { ...e, requestBody: undefined, responseBody: undefined },
        ),
        console: consoleEntries.slice(0, limit),
      });
    },
  );

  server.registerTool(
    "get_bug_reference",
    {
      title: "View bug reference",
      description:
        "Returns QA's reference screenshots for a record as images, so you can see the problem. Videos come back as a link (Drive videos also include a still frame).",
      inputSchema: {
        id: z.string().describe("Record ID from search_bugs or get_bug."),
        workbook: workbookArg,
        index: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Which reference (1-based, as numbered in get_bug). All of them (up to 5) if omitted."),
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ id, workbook: wb, index }) => {
      log("get_bug_reference", { id, workbook: wb, index });
      const loaded = await loadWorkbook(wb);
      if ("error" in loaded) return fail(loaded.error);
      const r = loaded.data.records.find((rec) => rec.id === id);
      if (!r) return fail(`No record "${id}" in workbook "${loaded.workbook.id}".`);
      if (r.media.length === 0) return text(`${id} has no reference attached.`);
      if (index && index > r.media.length) return fail(`${id} has only ${r.media.length} reference(s).`);

      const picked = index ? [{ m: r.media[index - 1], n: index }] : r.media.slice(0, 5).map((m, i) => ({ m, n: i + 1 }));
      const content: ToolResult["content"] = [];
      for (const { m, n } of picked) {
        content.push(...(await referenceContent(m, n, baseUrl)));
      }
      if (!index && r.media.length > 5) {
        content.push({ type: "text", text: `${r.media.length - 5} more reference(s); pass index to see them.` });
      }
      return { content };
    },
  );

  server.registerTool(
    "get_summary",
    {
      title: "Bug summary",
      description: "Counts of open bugs by tab, module and developer, plus overall status totals. Good for picking what to work on.",
      inputSchema: { workbook: workbookArg },
      annotations: READ_ONLY,
    },
    async ({ workbook: wb }) => {
      log("get_summary", { workbook: wb });
      const loaded = await loadWorkbook(wb);
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
      return json({
        workbook: { id: workbook.id, name: workbook.name },
        sheet_edited: data.modifiedTime,
        issues: byKind("issue"),
        test_cases: byKind("testcase"),
      });
    },
  );

  server.registerPrompt(
    "fix-bug",
    {
      title: "Fix a QA bug",
      description:
        "Reads a bug from UpTrack, looks at QA's screenshots, then fixes it in this codebase. Leave the bug empty to pick from the open ones.",
      argsSchema: {
        id: z
          .string()
          .optional()
          .describe('Record ID (e.g. "bugs-17"), a test case ID, or a few words describing the bug. Empty: choose from open bugs.'),
        workbook: z.string().optional().describe("Workbook ID; the main one if empty."),
      },
    },
    ({ id, workbook }) => {
      const from = workbook ? ` in workbook ${workbook}` : "";
      const target = id?.trim();
      const find = !target
        ? `No bug was named. Call search_bugs with open_only=true${from} (and get_summary if that helps), list the most relevant few for this codebase with their IDs and titles, and ask me which one to fix. Don't start changing code until I pick one.`
        : /^[a-z0-9-]+-\d+$/.test(target)
          ? `Fix QA bug ${target}${from}.`
          : `Find the QA bug matching "${target}"${from} with search_bugs (try it as a TC ID or as search words). If more than one matches, show them and ask me which one; if exactly one does, fix it.`;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${find}

Using the UpTrack tools:
1. Call get_bug to read the full report, then get_bug_reference to look at QA's screenshots.
2. Find the code responsible in this repository. If the report is ambiguous, say what you assumed.
3. Make the smallest change that fixes it, following the code around it. Check other places with the same problem if the report says so (e.g. "check for sub category also").
4. Run the relevant tests or checks.
5. Finish with a one-line Dev Remarks entry in the team's style, ready to paste into the sheet, e.g.
   "Fixed: <what changed and why> (<file>:<line>)" — or "Not valid: <reason>" if the code is already correct.`,
            },
          },
        ],
      };
    },
  );

  return server;
}

/** Links to UpTrack's own files are relative in records; agents need full URLs. */
const absolute = (url: string, baseUrl: string) => (url.startsWith("/") ? `${baseUrl}${url}` : url);

function formatBug(r: BugRecord, workbook: WorkbookSummary, url: string, open: boolean, baseUrl: string): string {
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
    ["Task ID", r.taskId],
    ["Bug ID", r.bugId],
    ["Reported by", r.capture?.reporter ?? ""],
    ["UpTrack page", url],
  ];
  for (const [k, v] of meta) if (v) lines.push(`- **${k}:** ${v}`);

  const sections: [string, string][] = [
    ["Description", r.description ?? ""],
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
    r.media.forEach((m, i) =>
      lines.push(`${i + 1}. ${describeKind(m)}${m.label ? ` "${m.label}"` : ""}: ${absolute(m.url, baseUrl)}`),
    );
  }
  return lines.join("\n");
}

function describeKind(m: MediaLink): string {
  if (m.kind === "drive") return m.video ? "Drive video" : "Drive file";
  if (m.kind === "probe") return "File";
  return m.kind[0].toUpperCase() + m.kind.slice(1);
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

const describeCall = (e: NetworkEntry) =>
  `${e.method} ${e.url} → ${e.status || `failed${e.error ? ` (${e.error})` : ""}`} in ${Math.round(e.durationMs)} ms`;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Page, browser and the most telling log lines of a bug reported with the extension. */
async function captureSummary(captureId: string, baseUrl: string): Promise<string> {
  const [c, log] = await Promise.all([getCapture(captureId), readCaptureLog(captureId)]);
  if (!c) return "";
  const lines = [
    "## Environment",
    `- **Page:** ${c.page.url}`,
    `- **Browser:** ${describeUserAgent(c.page.userAgent)}, window ${c.page.viewport.width}×${c.page.viewport.height} at ${c.page.devicePixelRatio}x`,
    `- **Share link:** ${baseUrl}/c/${c.id}`,
  ];
  const failed = log.network.filter(isFailed);
  lines.push("", `## Failed API calls (${failed.length} of ${log.network.length})`);
  if (failed.length === 0) lines.push("None.");
  for (const e of failed.slice(0, 10)) {
    lines.push(`- ${describeCall(e)}`);
    if (e.responseBody) lines.push(`  Response: ${clip(e.responseBody.replace(/\s+/g, " "), 400)}`);
  }
  if (failed.length > 10) lines.push(`- …and ${failed.length - 10} more`);
  const errors = log.console.filter((x) => x.level === "error");
  if (errors.length) {
    lines.push("", `## Console errors (${errors.length})`);
    for (const x of errors.slice(0, 10)) lines.push(`- ${clip(x.message.replace(/\s+/g, " "), 300)}`);
  }
  lines.push("", "Call get_bug_logs for every call with headers and bodies.");
  return lines.join("\n");
}

const LOCAL_FILE = /^\/c\/([A-Za-z0-9]{16})\/files\/([a-z0-9._-]+)$/;

/** A screenshot stored by UpTrack itself, read from disk instead of over HTTP. */
async function localImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  const match = url.match(LOCAL_FILE);
  const file = match && captureFilePath(match[1], match[2]);
  if (!file) return null;
  const mimeType = file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : null;
  if (!mimeType) return null;
  const bytes = await readFile(file).catch(() => null);
  if (!bytes || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { data: bytes.toString("base64"), mimeType };
}

async function referenceContent(m: MediaLink, n: number, baseUrl: string): Promise<ToolResult["content"]> {
  const head = `Reference ${n}${m.label ? ` "${m.label}"` : ""} (${absolute(m.url, baseUrl)})`;
  let image: { data: string; mimeType: string } | null = null;

  if (m.kind === "image" && LOCAL_FILE.test(m.url)) {
    image = await localImage(m.url);
    if (image) return [{ type: "text", text: `${head}:` }, { type: "image", ...image }];
  }

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
