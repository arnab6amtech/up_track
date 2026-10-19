
export const metadata = { title: "Browser extension — UpTrack" };

export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Report bugs from your browser</h1>
        <p className="mt-1 text-sm text-muted">
          The UpTrack extension takes a screenshot or records the tab, lets you mark up the screenshot, and attaches
          the page&apos;s API calls and console errors. You pick the project and version, and the bug lands in that
          project with a share link, where your AI agent can read it too. Works in Chrome, Edge and Brave.
        </p>
      </div>


      <Step n={1} title="Download">
        <a
          href="/extension/download"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Download the extension (.zip)
        </a>
        <p className="text-muted">It already knows this UpTrack&apos;s address.</p>
      </Step>

      <Step n={2} title="Install it">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Unzip the file. You&apos;ll get an <code className="font-mono">uptrack-extension</code> folder.</li>
          <li>
            Open <code className="font-mono">chrome://extensions</code> (in Edge{" "}
            <code className="font-mono">edge://extensions</code>, in Brave <code className="font-mono">brave://extensions</code>).
          </li>
          <li>Turn on <span className="font-medium">Developer mode</span>.</li>
          <li>
            Click <span className="font-medium">Load unpacked</span> and choose the{" "}
            <code className="font-mono">uptrack-extension</code> folder.
          </li>
          <li>Pin UpTrack from the puzzle-piece menu so its icon stays in the toolbar.</li>
        </ol>
      </Step>

      <Step n={3} title="Sign in">
        <p>
          Nothing to set up: the extension already knows this server, and reports bugs as the account you&apos;re signed
          in to UpTrack with in this browser. If you&apos;re signed out, its menu has a{" "}
          <span className="font-medium">Sign in</span> button. You pick the project and version for each report.
        </p>
      </Step>

      <Step n={4} title="Report a bug">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            On the page with the bug, click the icon and choose <span className="font-medium">Screenshot</span> or{" "}
            <span className="font-medium">Record this tab</span> (up to 5 minutes; stop from the same menu).
          </li>
          <li>
            Mark up the screenshot with arrows, boxes and text, and blur anything private. For a recording, trim it
            to the part that matters.
          </li>
          <li>
            Pick the project and the version you were testing, add a title and press{" "}
            <span className="font-medium">Create bug</span>. You get a share link and a ready command for your AI agent.
          </li>
        </ol>
      </Step>

      <section className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
        <h2 className="font-semibold">Good to know</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>
            API calls are recorded from the moment a page loads. Pages that were already open when you installed the
            extension need a reload first.
          </li>
          <li>
            Authorization headers, cookies, tokens and fields like <span className="font-mono">password</span> are
            hidden before anything leaves your browser. You can also leave the log out of a report.
          </li>
          <li>Chrome doesn&apos;t allow capturing its own pages, such as settings or the Web Store.</li>
        </ul>
      </section>
    </div>
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
