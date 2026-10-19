import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenCaller } from "@/server/tokens";
import { fail } from "./common";
import { getSheetRecord, getSheetReference, listWorkbooksTool, searchSheet, sheetSummary } from "./sheets";
import {
  BUG_KEY,
  getTrackerBug,
  getTrackerLogs,
  getTrackerReference,
  listProjectsTool,
  searchTracker,
  trackerSummary,
} from "./tracker";

const INSTRUCTIONS = `UpTrack is the team's bug tracker. Bugs belong to projects and are reported against a project version.
- Bug keys look like "UPT-12" (project key + number). Use search_bugs to find work (open_only=true for bugs still being worked on), get_bug for the full report, and get_bug_reference to see the screenshots before changing UI code.
- Bugs reported with the browser extension include the page's API calls: get_bug lists the failed ones, get_bug_logs has full requests, responses and console errors, which often point straight at the cause.
- Older QA spreadsheets are available too: list_workbooks, then pass workbook=<id> to search_bugs, get_bug, get_bug_reference and get_summary. Spreadsheet record IDs look like "bugs-17".
- This server is read-only: suggest the status change or comment for the user to make in UpTrack instead of claiming you made it.`;

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const workbookArg = z.string().optional().describe("Spreadsheet workbook ID from list_workbooks. Leave empty for tracker bugs.");

export function createMcpServer({ baseUrl, caller }: { baseUrl: string; caller: TokenCaller }) {
  const server = new McpServer({ name: "uptrack", version: "2.0.0" }, { instructions: INSTRUCTIONS });
  const log = (tool: string, args: unknown) => console.info(`[mcp] ${caller.userName} (${caller.orgSlug}) → ${tool} ${JSON.stringify(args)}`);

  server.registerTool(
    "list_projects",
    { title: "List projects", description: "Projects you can see, with open/total bug counts and their active versions.", annotations: READ_ONLY },
    async () => {
      log("list_projects", {});
      return listProjectsTool(caller);
    },
  );

  server.registerTool(
    "search_bugs",
    {
      title: "Search bugs",
      description:
        "Finds tracker bugs (default) or, with `workbook`, spreadsheet records. Text filters match case-insensitively. Returns compact rows; use get_bug for the full report.",
      inputSchema: {
        project: z.string().optional().describe("Project key, e.g. UPT."),
        version: z.string().optional().describe("Version the bug was found in, e.g. 1.0."),
        platform: z.string().optional().describe("Platform the bug was found on, e.g. Admin panel or User app."),
        feature: z.string().optional().describe("Feature the bug is in, e.g. Checkout."),
        module: z.string().optional().describe("Spreadsheets only: the module column."),
        open_only: z.boolean().optional().describe("Only bugs that aren't done yet."),
        status: z.string().optional().describe("Status name, e.g. Open, In progress, Ready for QA."),
        assignee: z.string().optional().describe('"me", "none", or part of a name.'),
        severity: z.string().optional().describe("critical, high, medium or low."),
        priority: z.string().optional().describe("urgent, high, medium or low."),
        query: z.string().optional().describe("Words to find in titles and descriptions."),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
        offset: z.number().int().min(0).optional(),
        workbook: workbookArg,
        kind: z.enum(["issue", "testcase"]).optional().describe("Spreadsheets only: issues or test cases."),
        tab: z.string().optional().describe("Spreadsheets only: sheet tab name."),
        dev_status: z.string().optional().describe("Spreadsheets only."),
        developer: z.string().optional().describe("Spreadsheets only."),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      log("search_bugs", args);
      if (args.workbook) return searchSheet({ ...args, workbook: args.workbook, developer: args.developer ?? args.assignee });
      return searchTracker(caller, args);
    },
  );

  server.registerTool(
    "get_bug",
    {
      title: "Get bug",
      description: "The full report for one bug: steps, expected and actual result, status, versions, people, failed API calls and comments.",
      inputSchema: { id: z.string().describe('Bug key such as "UPT-12", or a spreadsheet record ID with `workbook`.'), workbook: workbookArg },
      annotations: READ_ONLY,
    },
    async ({ id, workbook }) => {
      log("get_bug", { id, workbook });
      if (workbook) return getSheetRecord(id, workbook, baseUrl);
      if (!BUG_KEY.test(id.trim())) return fail(`"${id}" isn't a bug key like UPT-12. For spreadsheet records, pass the workbook too.`);
      return getTrackerBug(caller, id.trim(), baseUrl);
    },
  );

  server.registerTool(
    "get_bug_reference",
    {
      title: "View bug screenshots",
      description: "Returns a bug's screenshots as images so you can see the problem. Recordings come back as a link.",
      inputSchema: {
        id: z.string().describe('Bug key such as "UPT-12", or a spreadsheet record ID with `workbook`.'),
        workbook: workbookArg,
        index: z.number().int().min(1).optional().describe("Which reference (1-based, as numbered in get_bug). Up to 5 if omitted."),
      },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ id, workbook, index }) => {
      log("get_bug_reference", { id, workbook, index });
      if (workbook) return getSheetReference(id, workbook, index);
      if (!BUG_KEY.test(id.trim())) return fail(`"${id}" isn't a bug key like UPT-12.`);
      return getTrackerReference(caller, id.trim(), baseUrl, index);
    },
  );

  server.registerTool(
    "get_bug_logs",
    {
      title: "Get bug API log",
      description:
        "For bugs reported with the browser extension: the page's API calls (method, URL, status, timing, headers, request and response bodies) and console errors. Secrets were hidden before upload.",
      inputSchema: {
        id: z.string().describe('Bug key, e.g. "UPT-12".'),
        failed_only: z.boolean().optional().describe("Only calls that failed (network error or HTTP 4xx/5xx)."),
        url_contains: z.string().optional().describe("Only calls whose URL contains this text."),
        include_bodies: z.boolean().optional().describe("Include request/response bodies. Default true."),
        include_files: z
          .boolean()
          .optional()
          .describe("Also list the documents, stylesheets, scripts, fonts, images and media the page loaded (URL, status, timing, size). Default false."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
      annotations: READ_ONLY,
    },
    async ({ id, ...opts }) => {
      log("get_bug_logs", { id, ...opts });
      if (!BUG_KEY.test(id.trim())) return fail(`"${id}" isn't a bug key like UPT-12.`);
      return getTrackerLogs(caller, id.trim(), opts);
    },
  );

  server.registerTool(
    "get_summary",
    {
      title: "Bug summary",
      description: "Open bugs by project, severity, assignee, platform and feature, plus totals by status. Good for picking what to work on.",
      inputSchema: { project: z.string().optional().describe("Limit to one project key."), workbook: workbookArg },
      annotations: READ_ONLY,
    },
    async ({ project, workbook }) => {
      log("get_summary", { project, workbook });
      return workbook ? sheetSummary(workbook) : trackerSummary(caller, project);
    },
  );

  server.registerTool(
    "list_workbooks",
    { title: "List spreadsheet workbooks", description: "QA spreadsheets UpTrack reads (older bug lists and test cases).", annotations: READ_ONLY },
    async () => {
      log("list_workbooks", {});
      return listWorkbooksTool();
    },
  );

  server.registerPrompt(
    "fix-bug",
    {
      title: "Fix a bug",
      description: "Reads a bug from UpTrack, looks at its screenshots and API log, then fixes it in this codebase. Leave empty to pick from open bugs.",
      argsSchema: {
        id: z.string().optional().describe('Bug key (e.g. "UPT-12") or a few words describing the bug. Empty: choose from open bugs.'),
        workbook: z.string().optional().describe("Only for spreadsheet records."),
      },
    },
    ({ id, workbook }) => {
      const target = id?.trim();
      const from = workbook ? ` in spreadsheet workbook ${workbook}` : "";
      const find = !target
        ? `No bug was named. Call search_bugs with open_only=true${from} (get_summary helps too), list the most relevant few for this codebase with their keys and titles, and ask me which one to fix. Don't change code until I pick one.`
        : BUG_KEY.test(target) || workbook
          ? `Fix bug ${target}${from}.`
          : `Find the bug matching "${target}" with search_bugs. If more than one matches, show them and ask me which one; if exactly one does, fix it.`;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${find}

Using the UpTrack tools:
1. Call get_bug to read the full report, then get_bug_reference to look at the screenshots. If it came from the browser extension, check the failed API calls (get_bug_logs has the details).
2. Find the code responsible in this repository. If the report is ambiguous, say what you assumed.
3. Make the smallest change that fixes it, following the code around it.
4. Run the relevant tests or checks.
5. Finish with a short comment I can post on the bug, e.g. "Fixed: <what changed and why> (<file>:<line>)", or "Not valid: <reason>" if the code is already correct, and the status to move it to.`,
            },
          },
        ],
      };
    },
  );

  return server;
}
