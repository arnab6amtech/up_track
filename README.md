# UpTrack

A bug tracker for QA and development teams. QA reports bugs from a web form or straight from the page with the browser extension (annotated screenshot or tab recording, plus the page's API calls and console errors). Developers triage them through a simple workflow, and coding agents read them, screenshots and API logs included, through UpTrack's MCP server. Teams that still keep bugs in spreadsheets can import those too and browse them under **Sheets**.

## Organizations, projects and people

- **Sign up** at `/signup`, then create an **organization** (for example *Null Void Studio*). You become its owner.
- **Members** (`/o/<org>/settings/members`): invite people by email. Each invitation is a link, valid for 7 days, that you send yourself; there is no outgoing email yet. The person signs up (or signs in) with that email and accepts. Organization roles:
  - **Owner**: everything, including other owners. An organization always keeps at least one owner.
  - **Admin**: manages members and projects, and can do everything in every project.
  - **Member**: works on the projects they're added to.
- **Projects** have a short key (`UPT`) that prefixes bug numbers (`UPT-12`). In a project's **Settings**:
  - **Versions** (1.0, 1.1, …) with a status: planned, in development, in testing, released or archived. Every bug records the version it was found in, and optionally the version it was fixed in.
  - **Platforms** (Admin panel, User website, Vendor website, User app, …): the products one project covers. Optional; once a project has platforms, every new bug says which one it was found on and the bug list gets a tab per platform.
  - **Features** (Checkout, Cart, …): the areas of the product. Every new bug names the feature it's in, so a project needs at least one before bugs can be reported.
  - **Team**: who works on the project, each with a project role.

| Project role | Can |
| --- | --- |
| Project manager | Everything in the project, including settings, versions and the team |
| SQA engineer | Report, edit, assign, comment, share, move bugs between statuses, and **close** them (verify fixes) |
| Developer | Report, edit, comment, share, take a bug (assign it to themselves) and move it between statuses, but not close it |
| Viewer | Read only |

## Bugs

- **Report bug** (`/o/<org>/p/<KEY>/bugs/new`): title, platform (when the project has platforms), version found in, feature (required), severity (critical, high, medium, low), priority (urgent, high, medium, low), steps to reproduce, expected and actual result, and up to 10 screenshots or recordings of 25 MB each.
- **Bug list**: a tab per platform (with counts) when the project has platforms, then one row per bug with its key, feature, title, severity, status, references and the AI agent command. Click the reference thumbnails to open the screenshots and recordings in a side panel. People who can move bugs change the status right in the list, with the same rules as the bug page: only SQA engineers and managers can close a bug, and closing asks for the resolution. Search, filter by status (open, done or a specific status), version, feature, assignee and severity, and sort by recently updated, newest or severity, in pages of 50.
- **Bug page**: details, references (images and videos inline), comments and a full history of who changed what. Everything is changed in place: pick a new status or severity from the pills under the title, or a new assignee, fixed-in version, platform or feature from the details below it. Each change saves straight away. If someone else saved the bug in the meantime, your change is refused rather than overwriting theirs.
- **Workflow**: Open → In progress → Ready for QA → Closed, plus Reopened. Closing a bug needs a resolution (fixed, won't fix, duplicate, cannot reproduce, by design, deferred).
- **Share outside UpTrack**: creates a public, unguessable link (`/s/<token>`) that shows the report, references and API log to anyone who has it, with an optional expiry. Links can be revoked. Bugs from the extension get one automatically.

## Browser extension

`extension/` holds a Chrome, Edge and Brave extension (Manifest V3) for reporting bugs straight from the page, in the spirit of jam.dev:

- **Screenshot** of the visible page, marked up with arrows, boxes, text and blur. Blur hides private details before upload.
- **Record this tab** for up to 5 minutes, then trim it to the part viewers should see. The full recording is kept.
- **Network and console log:** from page load, the extension records the page's `fetch`/XHR calls in full (method, URL, status, timing, headers, bodies up to 20 KB), everything else it loads as Chrome DevTools lists it (document, CSS, JS, fonts, images, media, manifest, WebSockets, Wasm and other: URL, status where the browser reports it, timing and size), files that fail to load, and its console errors and uncaught exceptions. Filter chips (All, Fetch/XHR, Doc, CSS, JS, Font, Img, Media, Manifest, Socket, Wasm, Other) work as in DevTools, and the reporter ticks which requests and console entries to send. Authorization headers, cookies, and fields or query parameters named like passwords, tokens, secrets or API keys are replaced with `[hidden by UpTrack]` before anything leaves the browser. Calls made by workers or other sites' iframes aren't seen.
- **Create bug** picks the project, the version it was found in, the platform (when the project has platforms), the feature and the severity (the last choices are remembered), and files the bug in UpTrack. You get the bug key, its share link and the command for your AI agent.

Install it from the app's **Extension** page: download the zip, which already contains this server's address, then use **Load unpacked** in `chrome://extensions`. There's nothing to configure: the extension reports as whoever is signed in to UpTrack in that browser, to the projects where they may report bugs, across all their organizations. When signed out, its menu offers a **Sign in** button. Signed-in uploads are accepted only from extension pages (checked by `Origin`). An API token in the extension's settings is optional, for people who'd rather not stay signed in.

Development:

```bash
npm run ext:build   # build into extension/dist (npm run build does this too)
npm run ext:watch   # rebuild on change; static files are copied once at start
npm run ext:check   # type-check the extension
```

## API tokens

Coding agents sign in with a personal API token, and the extension can use one instead of the browser sign-in. Create one under **API tokens** in the user menu (`/o/<org>/settings/tokens`). A token belongs to one person in one organization and can do what that person can. It's shown once, stored only as a hash, and can be revoked at any time. Clients send `Authorization: Bearer upt_…`.

## Coding agents (MCP)

UpTrack is also an MCP server at `/api/mcp`. A coding agent such as Claude Code, Cursor or VS Code Copilot can use it to read bugs and see their screenshots while it works in your codebase. The **Connect agent** page and the floating **Use with your AI agent** button have copy-ready setup:

```bash
export UPTRACK_TOKEN=upt_…   # in ~/.zshrc or ~/.bashrc
claude mcp add --transport http uptrack https://uptrack.yourcompany.com/api/mcp \
  --header "Authorization: Bearer $UPTRACK_TOKEN"
```

| Tool | Returns |
| --- | --- |
| `list_projects` | Projects the token's owner can see, with open and total bug counts, active versions and platforms |
| `search_bugs` | Bugs filtered by project, version, platform, feature, status, assignee (`me` works), severity, priority or text. Add `open_only` for bugs that still need work. With `workbook`, searches a spreadsheet instead. |
| `get_bug` | The full report for a key like `UPT-12`: steps, results, status, versions, people, failed API calls, comments, numbered references |
| `get_bug_reference` | Screenshots as images. Recordings come back as a link. |
| `get_bug_logs` | For extension reports: the API calls with headers and bodies, and console errors. Filter by failed calls or URL; `include_files` adds the documents, styles, scripts, images and other files the page loaded. |
| `get_summary` | Open bugs by project, severity, assignee, platform and feature, plus totals by status |
| `list_workbooks` | Spreadsheet workbooks, for `search_bugs` and `get_bug` with `workbook` |

The `fix-bug` prompt (`/uptrack:fix-bug UPT-12` in the VS Code extension, `/mcp__uptrack__fix-bug` in the terminal) takes a bug key or a few words. Without one, it lists your open bugs to choose from. It reads the bug, looks at the screenshots and API log, fixes the code, and ends with a note to post on the bug. Every bug page has a button that copies this command.

The endpoint is read-only. Set `PUBLIC_URL` if the links it returns should use a different address than the one the agent called.

## Spreadsheets

**Sheets** (`/sheets`) is a read-only viewer for QA spreadsheets, for teams moving over from them. A **workbook** is one spreadsheet; switch between them from **Workbook** in its header.

- **Import sheet** (`/sheets/import`) adds a workbook in one of two ways:
  - **Upload file**: an .xlsx, .xls or .ods file of up to 25 MB. This is a snapshot, so import it again when the sheet changes.
  - **Google Drive link**: a Drive or Sheets link. UpTrack keeps reading the sheet live and caches it for about a minute; **Refresh** reads it again immediately. This needs Google credentials (see Setup).
- **Default workbook** (optional): set `GOOGLE_DRIVE_FILE_ID` (or `SHEET_FILE_PATH` for a local file) and `DEFAULT_WORKBOOK_NAME`. It shows first in the switcher and can't be removed from the app.
- **Manage** lists all workbooks. From there you can edit a workbook's columns or remove it. Removing one doesn't touch the original sheet.

Workbooks are shared by everyone who can sign in to this UpTrack server; they don't belong to an organization.

### Matching columns

Every team lays out its sheet differently, so the second step of an import is **Match your columns**:

1. **Header detection:** UpTrack finds each tab's header row. It can be below a title row, and it can span two rows.
2. **Column guesses:** it guesses what each column holds from common names. For example, *Summary / Title / Bug Details* become the title; *Status / Result* the QA status; *Dev Status / Resolution* the dev status; *Assignee / Developer / Owner* the developer; *Component / Module / Area* the module; and *Screenshot / Attachment / Reference / Link* the reference media.
3. **Your review:** you include or skip each tab, mark it as **issues** or **test cases**, fix any column guesses, and check a live preview of the first rows.
4. **Done statuses:** you tick which status values mean a bug needs no more work, such as Done, Closed, Fixed, Pass or Won't fix.

Only the title column is required. You can change the mapping any time with **Edit columns**. A workbook without a saved mapping, such as the default one, is detected automatically. Tabs added to the sheet later are detected automatically too.

**Open bugs:** a record is open unless its QA status or dev status is one of the workbook's done statuses. Anything marked *Re-open* is always open. Test cases with no status yet, meaning not run, aren't counted. The rule lives in `src/lib/open.ts`.

### Reference media

Links are collected from cell hyperlinks and from URLs written in the reference, QA remarks, actual result, title and dev remarks columns:

| Link | Shown as |
| --- | --- |
| Google Drive | The image itself, with a "Play in Drive" button for videos |
| Dropbox, or any `.mp4` / `.webm` / `.mov` URL | Video player |
| `.png` / `.jpg` / `.gif` / `.webp` URL | Image (click to enlarge) |
| Public file links without an extension (e.g. Mattermost) | Image or video, whichever it turns out to be |
| Anything else | Link |

Viewers only see Drive files that are shared with them, or shared as "anyone with the link".

On a sheet record's page: `←` / `→` go to the previous / next record in the filtered list, and `Esc` goes back to the list.

## Setup

```bash
npm install
cp .env.example .env.local   # optional; nothing is required to start
npm run dev
```

Open the app, sign up, and create your organization.

### Database

UpTrack stores everything in PostgreSQL. Migrations in `db/migrations/` run automatically when the app first touches the database; `npm run db:migrate` runs them on their own. The design is described in [docs/database/design.md](docs/database/design.md).

- **Embedded (default):** with no `DATABASE_URL`, UpTrack runs PostgreSQL inside the app process with [PGlite](https://pglite.dev), stored in `data/pg` (change it with `PGLITE_DIR`). There's nothing to install. Only one process can open it at a time, so stop the server before running the scripts below. This suits development and a single small server.
- **PostgreSQL server (production):** set `DATABASE_URL=postgres://…` (PostgreSQL 18 or later). `DATABASE_POOL_SIZE` sets the connection pool size (default 10). Several app servers can share it.

Screenshots, recordings and API logs are files under `data/storage` (change it with `STORAGE_DIR`). Spreadsheet imports and column mappings are in `data/workbooks` (`WORKBOOKS_DIR`). All of these must be on persistent storage and backed up with the database. Serverless hosts such as Vercel discard files written at runtime, so host UpTrack on a server or container with a persistent volume.

### Settings

All optional; see `.env.example`.

- `PUBLIC_URL`: the address people use to reach UpTrack, used in invite, share and agent links. Defaults to the request's own address.
- `ALLOW_SIGNUPS=false`: only people with an invitation can create an account.
- Database and storage: `DATABASE_URL`, `DATABASE_POOL_SIZE`, `PGLITE_DIR`, `STORAGE_DIR`, `WORKBOOKS_DIR`.
- **Google credentials**, for Drive links and a Drive-hosted default workbook in Sheets. Use one of:
  - **Service account** (works with private sheets): enable the Drive API in a Google Cloud project, create a service account, put its JSON key in `GOOGLE_SERVICE_ACCOUNT_KEY`, and share each sheet with the service account's email as **Viewer**.
  - **API key**: only works for sheets shared as "anyone with the link can view".
- **Default workbook**: `GOOGLE_DRIVE_FILE_ID` or `SHEET_FILE_PATH`, plus `DEFAULT_WORKBOOK_NAME`.

### Upgrading from the version without a database

- **Tokens:** `MCP_TOKENS` is no longer used. Each person signs up, creates a token under **API tokens**, and puts it in their shell profile (`UPTRACK_TOKEN`) and their agent's MCP config. The extension uses the browser's UpTrack sign-in, so clear the old token from its settings.
- **Sheets** moved from `/` to `/sheets`. Imported workbooks are kept.
- **Extension reports** saved in `data/workbooks/captures` can be imported into a project version. Old share links (`/c/<id>`) keep working.

  ```bash
  # stop the server first when using the embedded database
  npm run db:import-captures -- --org null-void-studio --project UPT --version 1.0 [--reporter you@example.com]
  ```

  Each capture's reporter is matched by name to a project member. Pass `--reporter` for the rest. Running it again skips captures that were already imported.

### Security notes

- Passwords are hashed with scrypt. Sessions last 30 days in an HTTP-only cookie (secure in production) and are stored server-side, so signing out ends them.
- API tokens, invitation links and share links are stored only as hashes.
- Attachments are served only to signed-in members of the project, or through a valid share link.
- Every organization's data is separated by organization ID in every query, and the schema has row-level security policies as a second line of defense when the app connects as a non-owner database role.
- Share links are unguessable but public: anyone with one can see that bug. Don't paste them anywhere public.
