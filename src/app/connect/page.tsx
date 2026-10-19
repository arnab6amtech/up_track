import Link from "next/link";
import { Suspense } from "react";
import { CopyBlock } from "@/components/copy-block";
import { publicOrigin } from "@/lib/origin";
import { listMyOrganizations } from "@/server/access";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Connect your agent — UpTrack" };

const TOOLS: [string, string][] = [
  ["list_projects", "Projects you can see, with open bug counts and active versions."],
  ["search_bugs", "Find bugs by project, version, module, status, assignee, severity or text; open_only for work that's left."],
  ["get_bug", "The full report: steps, expected and actual result, versions, people, failed API calls and comments."],
  ["get_bug_reference", "The bug's screenshots as images the agent can look at."],
  ["get_bug_logs", "Full API requests, responses and console errors for bugs reported with the extension."],
  ["get_summary", "Open bugs by project, severity, assignee and module."],
  ["list_workbooks", "Older QA spreadsheets; pass workbook=… to the tools above to read them."],
];

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Connect your coding agent</h1>
        <p className="mt-1 text-sm text-muted">
          UpTrack is an MCP server. Once it&apos;s connected, your agent can read QA&apos;s bugs and look at their
          screenshots while it works in your codebase. Access is read-only: the agent can&apos;t change the sheet.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-2" />}>
        <Setup />
      </Suspense>
    </div>
  );
}

async function Setup() {
  const user = await requireUser("/connect");
  const orgs = await listMyOrganizations(user.id);
  const tokensHref = orgs[0] ? `/o/${orgs[0].slug}/settings/tokens` : "/onboarding";
  const origin = await publicOrigin();
  const url = `${origin}/api/mcp`;

  const mcpJson = JSON.stringify(
    { mcpServers: { uptrack: { type: "http", url, headers: { Authorization: "Bearer ${UPTRACK_TOKEN}" } } } },
    null,
    2,
  );
  const vscodeJson = JSON.stringify(
    { servers: { uptrack: { type: "http", url, headers: { Authorization: "Bearer ${env:UPTRACK_TOKEN}" } } } },
    null,
    2,
  );

  return (
    <>

      <Step n={1} title="Get a token">
        <p>
          Create a personal token on your{" "}
          <Link href={tokensHref} className="font-medium underline underline-offset-2">
            API tokens
          </Link>{" "}
          page, then add it to your shell profile (for example <code className="font-mono">~/.zshrc</code>):
        </p>
        <CopyBlock label="shell" code={`export UPTRACK_TOKEN=paste-your-token-here`} />
      </Step>

      <Step n={2} title="Add UpTrack to the project">
        <p>
          Commit this as <code className="font-mono">.mcp.json</code> in the root of the codebase QA is testing. The
          token stays out of git; Claude Code reads it from your environment.
        </p>
        <CopyBlock label=".mcp.json" code={mcpJson} />
        <p>
          Or add it just for yourself from the terminal. Type <code className="font-mono">$UPTRACK_TOKEN</code> exactly
          as shown; the shell fills in your token from step 1.
        </p>
        <CopyBlock
          label="terminal"
          code={`claude mcp add --transport http uptrack ${url} \\\n  --header "Authorization: Bearer $UPTRACK_TOKEN"`}
        />
        <details className="text-sm">
          <summary className="cursor-pointer list-none font-medium underline underline-offset-2 hover:opacity-70 [&::-webkit-details-marker]:hidden">
            Using VS Code Copilot or Cursor?
          </summary>
          <div className="mt-3 space-y-3">
            <CopyBlock label=".vscode/mcp.json" code={vscodeJson} />
            <p className="text-muted">
              Cursor uses <code className="font-mono">.cursor/mcp.json</code> with the same layout as{" "}
              <code className="font-mono">.mcp.json</code> above.
            </p>
          </div>
        </details>
      </Step>

      <Step n={3} title="Use it">
        <p>
          Restart your agent and approve the <span className="font-medium">uptrack</span> server when asked. In Claude
          Code, <code className="font-mono">/mcp</code> shows whether it&apos;s connected. Then just ask:
        </p>
        <CopyBlock
          label="examples"
          code={[
            "What's still open? Group it by module.",
            "Fix UPT-12. Look at the screenshot first.",
            "Is the login timeout bug already fixed in this repo?",
          ].join("\n")}
        />
        <p>
          There&apos;s also a ready-made <span className="font-medium">fix-bug</span> prompt (
          <code className="font-mono">/mcp__uptrack__fix-bug</code> in the terminal,{" "}
          <code className="font-mono">/uptrack:fix-bug</code> in the VS Code extension). Give it a bug ID, a TC ID or a
          few words, or nothing to choose from the open bugs. It reads the bug, checks the screenshots, fixes the code,
          and finishes with a Dev Remarks line you can paste into the sheet.
        </p>
      </Step>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What the agent can do</h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {TOOLS.map(([name, desc]) => (
            <li key={name} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
              <code className="w-40 shrink-0 font-mono text-xs font-medium">{name}</code>
              <span className="text-sm text-muted">{desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-sm">
      <h2 className="flex items-center gap-2.5 font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-accent text-xs text-white">{n}</span>
        {title}
      </h2>
      <div className="space-y-3 pl-8.5">{children}</div>
    </section>
  );
}
