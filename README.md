# UpTrack

A read-only bug tracker view for teams whose QA tracks bugs and test cases in spreadsheets. Import any Excel file or Google Sheet. UpTrack lists every bug and test case with search and filters, and gives each one a details page that shows QA's screenshots and recordings inline. Coding agents can read the same bugs through UpTrack's MCP server.

## Workbooks

A **workbook** is one spreadsheet, for example one per product or release. Switch between them from **Workbook** in the header.

- **Import sheet** (`/import`) adds a workbook. There are two ways:
  - **Upload file**: an .xlsx, .xls or .ods file of up to 25 MB. This is a snapshot, so import it again when the sheet changes.
  - **Google Drive link**: a Drive or Sheets link. UpTrack keeps reading the sheet live and caches it for about a minute; **Refresh** reads it again immediately. This needs the Google credentials described under Setup.
- **Default workbook** (optional): set `GOOGLE_DRIVE_FILE_ID` (or `SHEET_FILE_PATH` for a local file) and `DEFAULT_WORKBOOK_NAME`. It shows first in the switcher and can't be removed from the app.
- **Manage** lists all workbooks. From there you can edit a workbook's columns or remove it. Removing one doesn't touch the original sheet.

## Matching columns

Every team lays out its sheet differently, so the second step of an import is **Match your columns**:

1. **Header detection:** UpTrack finds each tab's header row. It can be below a title row, and it can span two rows.
2. **Column guesses:** it guesses what each column holds from common names. For example, *Summary / Title / Bug Details* become the title; *Status / Result* the QA status; *Dev Status / Resolution* the dev status; *Assignee / Developer / Owner* the developer; *Component / Module / Area* the module; and *Screenshot / Attachment / Reference / Link* the reference media.
3. **Your review:** you include or skip each tab, mark it as **issues** or **test cases**, fix any column guesses, and check a live preview of the first rows.
4. **Done statuses:** you tick which status values mean a bug needs no more work, such as Done, Closed, Fixed, Pass or Won't fix.

Only the title column is required. You can change the mapping any time with **Edit columns**. A workbook without a saved mapping, such as the default one, is detected automatically. Tabs added to the sheet later are detected automatically too.

**Open bugs:** a record is open unless its QA status or dev status is one of the workbook's done statuses. Anything marked *Re-open* is always open. Test cases with no status yet, meaning not run, aren't counted. The rule lives in `src/lib/open.ts`.

## Reference media

Links are collected from cell hyperlinks and from URLs written in the reference, QA remarks, actual result, title and dev remarks columns:

| Link | Shown as |
| --- | --- |
| Google Drive | The image itself, with a "Play in Drive" button for videos |
| Dropbox, or any `.mp4` / `.webm` / `.mov` URL | Video player |
| `.png` / `.jpg` / `.gif` / `.webp` URL | Image (click to enlarge) |
| Public file links without an extension (e.g. Mattermost) | Image or video, whichever it turns out to be |
| Anything else | Link |

Viewers only see Drive files that are shared with them, or shared as "anyone with the link".

## Browser extension

`extension/` holds a Chrome, Edge and Brave extension (Manifest V3) for reporting bugs straight from the page, in the spirit of jam.dev:

- **Screenshot** of the visible page, marked up with arrows, boxes, text and blur. Blur hides private details before upload.
- **Record this tab** for up to 5 minutes, then trim it to the part viewers should see. The full recording is kept.
- **API log:** from page load, the extension records the page's `fetch`/XHR calls (method, URL, status, timing, headers, bodies up to 20 KB) and its console errors and uncaught exceptions. Authorization headers, cookies, and fields or query parameters named like passwords, tokens, secrets or API keys are replaced with `[hidden by UpTrack]` before anything leaves the browser. Calls made by workers or other sites' iframes aren't seen.
- **Create bug** uploads it to UpTrack. Each report gets a public share link, `/c/<id>`, with the media, page and browser details, and a filterable API and console log. It's added to the built-in **Reported bugs** workbook, where the AI agent can read it: `get_bug` lists the failed calls, and `get_bug_logs` returns the full requests and responses.

Install it from the app's **Extension** page: download the zip, which already contains this server's address, then use **Load unpacked** in `chrome://extensions`. The extension uses the same personal tokens as MCP (`MCP_TOKENS`). Reports are stored next to imports, in `data/workbooks/captures/`.

Development:

```bash
npm run ext:build   # build into extension/dist (npm run build does this too)
npm run ext:watch   # rebuild on change; static files are copied once at start
npm run ext:check   # type-check the extension
```

The share link is unguessable but public: anyone with it can see the report. Don't paste share links anywhere public.

## Coding agents (MCP)

UpTrack is also an MCP server at `/api/mcp`. A coding agent such as Claude Code, Cursor or VS Code Copilot can use it to read QA's bugs and see their screenshots while it works in your codebase. The **Connect agent** page and the floating **Use with your AI agent** button have copy-ready setup.

| Tool | Returns |
| --- | --- |
| `search_bugs` | Issues and test cases filtered by tab, module, status, dev status, developer or text. Add `open_only` for bugs that still need a developer. |
| `get_bug` | The full report (steps, expected and actual result, remarks, statuses), with numbered references |
| `get_bug_reference` | Reference screenshots as images. Videos come back as a link; Drive videos also include a still frame. |
| `get_summary` | Open bugs by tab, module and developer, plus status totals |
| `list_workbooks` | The workbooks the agent can pass to the other tools |

The `fix-bug` prompt (`/uptrack:fix-bug` in the VS Code extension, `/mcp__uptrack__fix-bug` in the terminal) takes a bug ID, a test case ID or a few words. Without one, it lists open bugs to choose from. It reads the bug, looks at the screenshots, fixes the code, and ends with a dev remarks line to paste into the sheet. Each bug in the list and on its details page has a button that copies this command.

Bug IDs are the tab name plus the sheet row, for example `bugs-17`. They change if rows are inserted above.

The endpoint is **read-only** and **off until tokens are configured**:

```bash
# one token per person, so the server log shows who called what
MCP_TOKENS=alice:<token>,bob:<token>        # generate with: openssl rand -hex 24
PUBLIC_URL=https://uptrack.yourcompany.com  # optional; used in links returned to the agent
```

Clients send `Authorization: Bearer <token>`. To revoke a token, remove it from `MCP_TOKENS` and restart. Screenshots shared as "anyone with the link" load directly. Private Drive files load only when the server has Google credentials and the file is shared with that account.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Nothing is required to start. With no settings, UpTrack opens empty and you import sheets from the app. Optional settings (see `.env.example`):

- **Google credentials**, for Drive links and a Drive-hosted default workbook. Use one of:
  - **Service account** (works with private sheets): enable the Drive API in a Google Cloud project, create a service account, put its JSON key in `GOOGLE_SERVICE_ACCOUNT_KEY`, and share each sheet with the service account's email as **Viewer**.
  - **API key**: only works for sheets shared as "anyone with the link can view".
- **Default workbook**: `GOOGLE_DRIVE_FILE_ID` or `SHEET_FILE_PATH`, plus `DEFAULT_WORKBOOK_NAME`.
- **MCP tokens**: `MCP_TOKENS`, to turn on the agent endpoint.

### Storage and access

Imports and column mappings are saved in `data/workbooks/` (change it with `WORKBOOKS_DIR`). That folder holds the uploaded files, `index.json` and `mappings.json`, and it has to be on persistent storage. Serverless hosts such as Vercel discard files written at runtime, so imports would disappear there. Host UpTrack on a server or container with a persistent volume, or move this storage to a database or blob store.

UpTrack has no login: anyone who can open it can import, edit and remove workbooks. Put it behind your team's login or VPN if that matters.

## Keyboard

On a details page: `←` / `→` go to the previous / next record in the filtered list, and `Esc` goes back to the list.
