import Image from "next/image";
import Link from "next/link";
import { ExplainerVideo } from "./explainer-video";
import listShot from "./images/list.webp";
import overviewShot from "./images/overview.webp";
import reportShot from "./images/report.webp";
import styles from "./landing.module.css";
import { Reveal } from "./reveal";

/*
 * The public homepage. One goal: create an account. Everything claimed here is something UpTrack does
 * today; the phone is labelled as a concept. No customer logos, quotes or numbers: there are none to show.
 */

const SIGNUP = "/signup";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold transition hover:border-neutral-400 hover:bg-neutral-50";

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path fillRule="evenodd" d={d} clipRule="evenodd" />
    </svg>
  );
}
const I = {
  arrow: "M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z",
  check: "M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z",
  play: "M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z",
  camera: "M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  list: "M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 15.25a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 10a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1V10Z",
  wrench: "M19 5.5a4.5 4.5 0 0 1-4.791 4.49c-.873-.055-1.808.128-2.368.8l-6.024 7.23a2.724 2.724 0 1 1-3.837-3.837L9.21 8.16c.672-.56.855-1.495.8-2.368a4.5 4.5 0 0 1 5.873-4.575c.324.105.39.51.15.752L13.34 4.66a.455.455 0 0 0-.11.494 3.01 3.01 0 0 0 1.617 1.617c.17.07.363.02.493-.111l2.692-2.692c.241-.241.647-.174.752.15.14.435.216.9.216 1.382ZM4 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  flow: "M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z",
  chart: "M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z",
  chat: "M3.43 2.524A41.29 41.29 0 0 1 10 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 0 1-5.183.501.78.78 0 0 0-.528.224l-3.579 3.58A.75.75 0 0 1 6 17.25v-3.443a41.033 41.033 0 0 1-2.57-.33C1.993 13.244 1 11.986 1 10.573V5.426c0-1.413.993-2.67 2.43-2.902Z",
  link: "M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Zm-3.476 7.392a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z",
  users: "M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z",
  sheet: "M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.267 2.267 0 0 1 1 14.74l-.01-9.5Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.373a.75.75 0 0 0 .627-.74Zm1.5 0a.75.75 0 0 0 .627.74h5.373a.75.75 0 0 0 .75-.75v-.615a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625Zm6.75-3.63v-.625a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75h5.25a.75.75 0 0 0 .75-.75Zm-8.25 0v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75ZM17.5 7.5v-.625a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75V7.5c0 .414.336.75.75.75h5.25a.75.75 0 0 0 .75-.75Zm-8.25 0v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75V7.5c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75Z",
  lock: "M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z",
};

/** The tour's captions, as a transcript for people who can't watch it. */
const TRANSCRIPT = [
  "UpTrack: every bug, from report to fix.",
  "Sign up as an organization for your team, or on your own with a Personal account.",
  "Your workspace is ready as soon as you sign up.",
  "Create a project with its first version, then add its platforms and features.",
  "Invite developers and QA by email. They accept, and join the projects you choose.",
  "Found a bug? Click the UpTrack extension to take a screenshot or record the tab.",
  "Mark it up with boxes, arrows and blur. The page's API calls and console errors come along.",
  "Pick the project and version, add a title, and the bug is reported.",
  "Every report lands in one list, organized by platform and status.",
  "Assign bugs, move them along, and see where each platform stands.",
  "Talk it through in threaded comments, or hand the bug's key to your AI coding agent.",
  "When the fix is in, QA verifies it and closes the bug. Its history stays with it.",
  "A look ahead: a concept of UpTrack on your phone. It's a preview, not an app you can get today.",
  "Create your UpTrack account and report your first bug.",
];

const FAQ: [string, React.ReactNode][] = [
  [
    "Who is UpTrack for?",
    "QA testers who find bugs, the developers who fix them, and the people who run the projects. You can also use it on your own with a Personal account.",
  ],
  [
    "Which browsers does the extension work in?",
    "Chrome, Edge and Brave. Once you're signed in, the Extension page has the download and a step-by-step install guide.",
  ],
  [
    "What does the extension capture, and what does it leave out?",
    "A screenshot you can mark up, or a recording of the tab of up to 5 minutes, plus the page's API calls and console errors. Authorization headers, cookies, tokens and fields like password are hidden before anything leaves your browser, and you can leave the log out of a report.",
  ],
  [
    "How do I bring my team in?",
    "Invite people by email as a Developer, QA or Admin, and pick the projects they join. They get an email to accept or decline the invitation.",
  ],
  [
    "Which AI coding agents work with UpTrack?",
    "Claude Code, Cursor and Copilot connect to UpTrack over MCP with a personal API token. Your agent can read bugs, their screenshots and their API logs. It can't change anything in UpTrack.",
  ],
  ["Can we bring our existing QA spreadsheet?", "Yes. Upload an Excel or OpenDocument workbook (.xlsx, .xlsm, .xls or .ods) and browse its issues and test cases under Sheets."],
  ["Can I share a bug with someone outside UpTrack?", "Yes. Create a share link from the bug. It can expire in 7 or 30 days, or never, and you can revoke it at any time."],
  ["Is there a mobile app?", "Not yet. The phone on this page is a concept preview. Today, UpTrack runs in your browser."],
];

export function LandingPage() {
  return (
    <div className="space-y-28 sm:space-y-36">
      <Hero />
      <Pillars />
      <Features />
      <HowItWorks />
      <Roles />
      <MobileConcept />
      <Plans />
      <Faq />
      <ClosingCta />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">{children}</p>;
}

function SectionHead({ eyebrow, title, body, center = true }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{body}</p>}
    </Reveal>
  );
}

/** A browser window around a product screenshot. */
function Frame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-2xl shadow-black/[0.08] ring-1 ring-black/[0.02]">
      <div className="flex h-9 items-center gap-2 border-b border-line bg-neutral-50 px-4" aria-hidden>
        <span className="size-2.5 rounded-full bg-neutral-300" />
        <span className="size-2.5 rounded-full bg-neutral-300" />
        <span className="size-2.5 rounded-full bg-neutral-300" />
        {label && <span className="ml-3 truncate text-xs text-muted">{label}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------------- Hero and tour ---------------- */

function Hero() {
  return (
    <section className="relative isolate pt-6 sm:pt-12" aria-labelledby="hero-title">
      {/* A faint grid and glow behind the headline. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[38rem] bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]"
        aria-hidden
      />
      <div className="mx-auto max-w-3xl text-center">
        <p className={`${styles.rise} inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted shadow-sm`}>
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          Bug tracking for QA teams and developers
        </p>
        <h1
          id="hero-title"
          className={`${styles.rise} mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl`}
          style={{ "--delay": "80ms" } as React.CSSProperties}
        >
          Every bug, from report to fix.
        </h1>
        <p className={`${styles.rise} mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted sm:text-xl`} style={{ "--delay": "160ms" } as React.CSSProperties}>
          Report bugs from the page you&apos;re testing, with screenshots, recordings and API logs attached. Track them by platform and status, and
          close them once QA has checked the fix.
        </p>
        <div className={`${styles.rise} mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row`} style={{ "--delay": "240ms" } as React.CSSProperties}>
          <Link href={SIGNUP} className={`${primary} w-full sm:w-auto`}>
            Create your account
            <Icon d={I.arrow} className="size-4" />
          </Link>
          <a href="#tour" className={`${secondary} w-full sm:w-auto`}>
            <Icon d={I.play} className="size-4" />
            Watch the tour (1:18)
          </a>
        </div>
        <ul className={`${styles.rise} mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted`} style={{ "--delay": "320ms" } as React.CSSProperties}>
          {["Extension for Chrome, Edge and Brave", "Works with Claude Code, Cursor and Copilot", "Sensitive headers hidden before upload"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Icon d={I.check} className="size-4 text-emerald-600" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div id="tour" className={`${styles.rise} relative mx-auto mt-16 max-w-5xl scroll-mt-24`} style={{ "--delay": "380ms" } as React.CSSProperties}>
        <div className="pointer-events-none absolute inset-x-0 -bottom-10 top-10 -z-10 rounded-[3rem] sm:-inset-x-10 bg-gradient-to-b from-neutral-200/70 to-transparent blur-2xl" aria-hidden />
        <Frame label="UpTrack: the 78-second tour">
          <ExplainerVideo
            poster="/landing/uptrack-explainer-poster.webp"
            mp4="/landing/uptrack-explainer.mp4"
            webm="/landing/uptrack-explainer.webm"
            label="UpTrack product tour, 78 seconds, with captions on screen"
          />
        </Frame>
        <div className="mt-5 flex flex-col items-center justify-between gap-2 text-sm text-muted sm:flex-row">
          <p>From sign-up to a closed bug in 78 seconds. The captions are on screen, so no sound is needed.</p>
          <details className="group text-left sm:text-right">
            <summary className="cursor-pointer select-none font-medium text-foreground underline-offset-4 hover:underline">Read the transcript</summary>
            <ol className="mt-3 max-w-xl list-decimal space-y-1.5 pl-5 text-left">
              {TRANSCRIPT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Value pillars ---------------- */

function Pillars() {
  const items = [
    [I.camera, "Report with the proof attached", "Screenshot or record the tab, mark it up, and the page's API calls and console errors come along, so developers see what you saw."],
    [I.list, "Know where every bug stands", "Each project has its own platforms, features, statuses and severity levels, so the list matches how your team works."],
    [I.wrench, "Hand developers everything", "Steps, expected and actual results, threaded comments and the full history, plus a bug key your AI coding agent can read."],
  ] as const;
  return (
    <section aria-label="Why UpTrack">
      <ul className="grid gap-6 md:grid-cols-3">
        {items.map(([icon, title, body], i) => (
          <Reveal as="li" key={title} delay={i * 90} className="rounded-2xl border border-line bg-white p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-neutral-950 text-white">
              <Icon d={icon} />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{body}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Features ---------------- */

function Features() {
  return (
    <section id="features" className="scroll-mt-24 space-y-12" aria-labelledby="features-title">
      <SectionHead eyebrow="Features" title="Everything a bug needs, in one place" body="Built around the way QA and developers hand work to each other." />
      <div className="grid gap-5 lg:grid-cols-6">
        {/* The extension: the biggest card. */}
        <Reveal className="flex flex-col overflow-hidden rounded-3xl border border-line bg-neutral-950 p-8 text-white lg:col-span-4">
          <p className="text-sm font-semibold text-neutral-400">Browser extension</p>
          <h3 className="mt-2 max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">Capture the bug right where you found it</h3>
          <ul className="mt-6 grid gap-3 text-sm text-neutral-300 sm:grid-cols-2">
            {[
              "Screenshots with arrows, boxes, text and blur",
              "Tab recordings of up to 5 minutes, trimmed to the part that matters",
              "The page's API calls and console errors, attached",
              "Authorization headers, cookies, tokens and passwords hidden before upload",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Icon d={I.check} className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                {t}
              </li>
            ))}
          </ul>
          {/* A recording, trimmed to the part that matters. */}
          <div className="mt-8 rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10" aria-hidden>
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-2 font-medium text-neutral-200">
                <span className="size-2 rounded-full bg-red-500" />
                Tab recording · 0:42
              </span>
              <span>Showing 0:08 – 0:31</span>
            </div>
            <div className="relative mt-3 flex h-9 items-end gap-[3px]">
              {[30, 55, 40, 70, 45, 80, 60, 35, 65, 90, 50, 75, 40, 60, 85, 45, 30, 55, 70, 40, 60, 35, 50, 25, 45, 30].map((h, i) => (
                <span key={i} className={`flex-1 rounded-sm ${i >= 5 && i <= 18 ? "bg-white/70" : "bg-white/15"}`} style={{ height: `${h}%` }} />
              ))}
              <span className="absolute inset-y-[-4px] left-[19%] w-1 rounded-full bg-amber-400" />
              <span className="absolute inset-y-[-4px] left-[73%] w-1 rounded-full bg-amber-400" />
            </div>
          </div>
          {/* The report panel, as the extension shows it. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-[1.1fr_1fr]" aria-hidden>
            <div className="relative overflow-hidden rounded-xl bg-white p-4 text-neutral-900">
              <p className="text-xs font-semibold">Your cart</p>
              <div className="mt-3 space-y-2">
                {[
                  ["Arc desk lamp", "$48.00", "from-amber-200 to-amber-500"],
                  ["Dot-grid notebooks", "$16.00", "from-blue-200 to-indigo-500"],
                ].map(([n, p, g]) => (
                  <div key={n} className="flex items-center gap-2.5 text-xs">
                    <span className={`size-8 rounded-md bg-gradient-to-br ${g}`} />
                    <span className="flex-1">{n}</span>
                    <span className="font-medium">{p}</span>
                  </div>
                ))}
              </div>
              <div className="relative mt-3 space-y-1 rounded-lg bg-neutral-50 p-2.5 text-xs">
                <div className="flex justify-between text-neutral-500">
                  <span>Discount (10%)</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>$64.00</span>
                </div>
                <span className="absolute -inset-1 rounded-lg border-2 border-red-500" />
              </div>
              <span className="absolute right-4 top-4 h-3.5 w-20 rounded bg-neutral-300/70 backdrop-blur" title="Blurred" />
            </div>
            <div className="overflow-hidden rounded-xl bg-neutral-900 font-mono text-[11px] ring-1 ring-white/10">
              <div className="flex justify-between border-b border-white/10 px-3 py-2 font-sans text-xs">
                <span className="font-semibold">API log</span>
                <span className="text-neutral-400">1 failed</span>
              </div>
              {[
                ["GET", "/api/cart", "200", false],
                ["POST", "/api/cart/coupon", "500", true],
                ["GET", "/api/session", "200", false],
              ].map(([m, u, s, bad]) => (
                <div key={String(u)} className={`grid grid-cols-[2.6rem_1fr_2rem] gap-2 px-3 py-2 ${bad ? "bg-red-500/15 text-red-300" : "text-neutral-300"}`}>
                  <span>{m}</span>
                  <span className="truncate">{u}</span>
                  <span>{s}</span>
                </div>
              ))}
              <div className="border-t border-white/10 px-3 py-2 text-amber-300">console.error · 1</div>
            </div>
          </div>
        </Reveal>

        <div className="grid gap-5 lg:col-span-2">
        <FeatureCard icon={I.flow} title="A workflow that fits each project" body="Add statuses like Blocked or severity levels like Trivial. Everyone on the project can shape the lists, and you choose where new bugs start.">
          <div className="mt-5 flex flex-wrap gap-2" aria-hidden>
            {[
              ["Open", "#64748b"],
              ["In progress", "#2563eb"],
              ["Ready for QA", "#9333ea"],
              ["Closed", "#16a34a"],
            ].map(([n, c]) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
                <span className="size-2 rounded-full" style={{ background: c }} />
                {n}
              </span>
            ))}
          </div>
        </FeatureCard>

        <FeatureCard icon={I.chart} title="See where each platform stands" body="An overview counts bugs by platform and status, with how much of each is done." delay={80}>
          <div className="mt-5 space-y-2.5" aria-hidden>
            {[
              ["Website", 20],
              ["Admin panel", 33],
              ["Android app", 33],
            ].map(([n, w]) => (
              <div key={n} className="text-xs">
                <div className="flex justify-between text-muted">
                  <span>{n}</span>
                  <span>{w}% done</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-neutral-950" style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </FeatureCard>
        </div>

        <Reveal className="overflow-hidden rounded-3xl border border-line bg-white p-8 lg:col-span-3">
          <span className="grid size-10 place-items-center rounded-xl bg-neutral-100">
            <Icon d={I.wrench} />
          </span>
          <h3 className="mt-5 text-xl font-semibold tracking-tight">Let your AI coding agent read the bug</h3>
          <p className="mt-2 leading-relaxed text-muted">
            Connect Claude Code, Cursor or Copilot over MCP. Your agent reads the report, its screenshots and its API logs while it fixes your code. It
            can&apos;t change anything in UpTrack.
          </p>
          <div className="mt-6 rounded-xl bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-300" aria-hidden>
            <p>
              <span className="text-emerald-400">❯</span> Fix STF-12. Look at the screenshot first.
            </p>
            <p className="mt-2 text-sky-300">⏺ uptrack · get_bug</p>
            <p className="text-sky-300">⏺ uptrack · get_bug_reference</p>
            <p className="text-sky-300">⏺ uptrack · get_bug_logs</p>
          </div>
        </Reveal>

        <FeatureCard className="lg:col-span-3" icon={I.chat} title="Talk it through on the bug" body="Threaded comments and replies keep the conversation with the bug, and its history records every change: who moved it, assigned it or edited it." delay={80}>
          <div className="mt-6 space-y-3" aria-hidden>
            <div className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-600 text-[11px] font-semibold text-white">LP</span>
              <div className="rounded-xl bg-neutral-100 px-3.5 py-2.5 text-sm">
                <span className="font-semibold">Leo Park</span> Reproduced. The coupon is gone after a refresh.
              </div>
            </div>
            <div className="ml-11 flex gap-3 border-l-2 border-line pl-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-600 text-[11px] font-semibold text-white">MC</span>
              <div className="rounded-xl bg-neutral-100 px-3.5 py-2.5 text-sm">
                <span className="font-semibold">Maya Chen</span> Thanks! The API log is attached.
              </div>
            </div>
          </div>
        </FeatureCard>

        <FeatureCard className="lg:col-span-2" icon={I.users} title="The right access for each person" body="Developers fix bugs. QA reports, verifies and closes them. Admins run every project. Invite people by email to accept or decline." />
        <FeatureCard className="lg:col-span-2" icon={I.link} title="Share outside UpTrack" body="Send a read-only link to a bug that expires in 7 or 30 days, or never. Revoke it whenever you like." delay={80} />
        <FeatureCard className="lg:col-span-2" icon={I.sheet} title="Bring your QA spreadsheet" body="Upload an Excel or OpenDocument workbook and browse its issues and test cases next to your tracked bugs." delay={160} />
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, body, className = "", delay = 0, children }: { icon: string; title: string; body: string; className?: string; delay?: number; children?: React.ReactNode }) {
  return (
    <Reveal delay={delay} className={`rounded-3xl border border-line bg-white p-8 ${className}`}>
      <span className="grid size-10 place-items-center rounded-xl bg-neutral-100">
        <Icon d={icon} />
      </span>
      <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
      {children}
    </Reveal>
  );
}

/* ---------------- How it works ---------------- */

function HowItWorks() {
  const steps = [
    ["Create your account", "Choose Organization to work with a team, or Personal to track bugs on your own."],
    ["Set up a project", "Add its versions, platforms and features, then invite your developers and QA."],
    ["Report bugs", "Use the browser extension or the web form. Screenshots, recordings and logs come along."],
    ["Fix and verify", "Developers fix with everything in front of them. QA checks the fix and closes the bug."],
  ];
  return (
    <section id="how-it-works" className="scroll-mt-24 space-y-12" aria-labelledby="how-title">
      <SectionHead eyebrow="How it works" title="From sign-up to a closed bug in four steps" />
      <ol className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* The line through the steps on wide screens. */}
        <div className="absolute left-8 right-8 top-[2.1rem] hidden h-px bg-gradient-to-r from-line via-neutral-300 to-line lg:block" aria-hidden />
        {steps.map(([title, body], i) => (
          <Reveal as="li" key={title} delay={i * 100} className="relative rounded-2xl border border-line bg-white p-6">
            <span className="relative grid size-11 place-items-center rounded-full bg-neutral-950 text-sm font-semibold text-white ring-8 ring-white">{i + 1}</span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{body}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal className="text-center">
        <Link href={SIGNUP} className={primary}>
          Create your account
          <Icon d={I.arrow} className="size-4" />
        </Link>
      </Reveal>
    </section>
  );
}

/* ---------------- For each role ---------------- */

function Roles() {
  const rows = [
    {
      who: "For QA",
      title: "Report it once, with everything in it",
      points: ["Report from the page you're testing, or from the web form", "Steps, expected and actual results in every report", "Close bugs once you've checked the fix"],
      image: reportShot,
      alt: "UpTrack's Report a bug form with title, platform, version, feature, severity, priority and assignee",
      label: "Report a bug",
    },
    {
      who: "For developers",
      title: "Your bugs, sorted the way you work",
      points: ["Filter by platform, status, version, feature, severity or assignee", "Change status and assignee right from the list", "Copy a bug's key for your AI agent with one click"],
      image: listShot,
      alt: "UpTrack's bug list with platforms and statuses in the sidebar, and severity, status and assignee on each bug",
      label: "Storefront · Open bugs",
    },
    {
      who: "For project leads",
      title: "See where every platform stands",
      points: ["Open and done counts for each platform", "Statuses and severity that fit each project", "Roles and per-project access for your team"],
      image: overviewShot,
      alt: "UpTrack's project overview with totals by status and a card for each platform showing how much is done",
      label: "Storefront · Overview",
    },
  ];
  return (
    <section id="teams" className="scroll-mt-24 space-y-16" aria-labelledby="roles-title">
      <SectionHead eyebrow="Made for the whole team" title="One place for everyone who touches a bug" />
      {rows.map((r, i) => (
        <div key={r.who} className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <Reveal className={i % 2 ? "lg:order-last" : ""}>
            <Eyebrow>{r.who}</Eyebrow>
            <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{r.title}</h3>
            <ul className="mt-6 space-y-3">
              {r.points.map((p) => (
                <li key={p} className="flex gap-3 leading-relaxed text-muted">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-white">
                    <Icon d={I.check} className="size-3" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <Frame label={r.label}>
              <Image src={r.image} alt={r.alt} sizes="(min-width: 1280px) 720px, (min-width: 1024px) 58vw, 100vw" className="h-auto w-full" placeholder="blur" />
            </Frame>
          </Reveal>
        </div>
      ))}
    </section>
  );
}

/* ---------------- Mobile concept ---------------- */

function MobileConcept() {
  return (
    <section id="mobile" className="scroll-mt-24" aria-labelledby="mobile-title">
      <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-neutral-50 to-neutral-100 px-6 py-14 sm:px-12 lg:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-neutral-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-600 sm:text-xs sm:tracking-[0.14em]">
              Concept preview · not available yet
            </p>
            <h2 id="mobile-title" className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A look ahead: UpTrack on your phone
            </h2>
            <p className="mt-4 max-w-lg text-pretty text-lg leading-relaxed text-muted">
              This is a concept of what a mobile app could look like: check your bugs, open one, and move it along from anywhere. It isn&apos;t a
              product you can download. Today, UpTrack runs in your browser.
            </p>
            <Link href={SIGNUP} className={`${primary} mt-8`}>
              Use UpTrack in your browser
              <Icon d={I.arrow} className="size-4" />
            </Link>
          </Reveal>
          <div className="flex justify-center" role="img" aria-label="Concept of a mobile UpTrack app: a list of bugs, one bug opened, and its status changed to Ready for QA">
            <PhoneConcept />
          </div>
        </div>
      </div>
    </section>
  );
}

/** A phone in CSS, looping through a concept flow (see landing.module.css). */
function PhoneConcept() {
  const card = (key: string, sev: [string, string], title: string, status: [string, string], where: string) => (
    <div className="mx-3 mb-2 rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-mono text-neutral-500">{key}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${sev[1]}`}>{sev[0]}</span>
      </div>
      <p className="mt-1.5 text-[13px] font-semibold leading-snug">{title}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-neutral-600">
        <span className="size-1.5 rounded-full" style={{ background: status[1] }} />
        {status[0]} · {where}
      </p>
    </div>
  );
  return (
    <div className="relative" aria-hidden>
      <div className={`${styles.phoneTilt} relative h-[600px] w-[296px] rounded-[3.2rem] bg-neutral-900 p-[11px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.45)] ring-1 ring-black/50`}>
        <span className="absolute -left-[3px] top-36 h-14 w-[3px] rounded-l bg-neutral-800" />
        <span className="absolute -left-[3px] top-52 h-14 w-[3px] rounded-l bg-neutral-800" />
        <span className="absolute -right-[3px] top-44 h-20 w-[3px] rounded-r bg-neutral-800" />
        <div className="relative h-full overflow-hidden rounded-[2.5rem] bg-neutral-100 text-neutral-950">
          <span className="absolute left-1/2 top-2.5 z-30 h-7 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex h-11 items-end justify-between px-7 pb-1 text-[11px] font-semibold">
            <span>9:41</span>
            <span className="tracking-wider">●●● ◔</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-11">
            {/* The list. */}
            <div className={`${styles.list} absolute inset-0`}>
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <span className="text-xl font-bold tracking-tight">Storefront</span>
                <span className="grid size-7 place-items-center rounded-full bg-violet-600 text-[9px] font-semibold text-white">MC</span>
              </div>
              <div className="mx-3 mb-3 flex rounded-lg bg-neutral-200/80 p-0.5 text-[11px] font-semibold text-neutral-600">
                <span className="flex-1 rounded-md bg-white py-1 text-center text-neutral-950 shadow-sm">Open</span>
                <span className="flex-1 py-1 text-center">Mine</span>
                <span className="flex-1 py-1 text-center">All</span>
              </div>
              <div className="relative">
                {card("STF-12", ["High", "bg-orange-100 text-orange-800"], "Coupon discount lost after refresh", ["In progress", "#2563eb"], "Website")}
                <span className={`${styles.tap1} absolute left-1/2 top-6 size-12 -translate-x-1/2 rounded-full border-2 border-white bg-black/20`} />
              </div>
              {card("STF-11", ["Medium", "bg-yellow-100 text-yellow-800"], "Search shows archived products", ["In progress", "#2563eb"], "Website")}
              {card("STF-10", ["High", "bg-orange-100 text-orange-800"], "Order export never finishes", ["Open", "#64748b"], "Admin panel")}
              {card("STF-9", ["Low", "bg-slate-100 text-slate-700"], "Login button overlaps on small screens", ["In progress", "#2563eb"], "Android app")}
            </div>
            {/* The bug. */}
            <div className={`${styles.detail} absolute inset-0 bg-neutral-100`}>
              <p className="px-4 pt-3 text-[13px] font-semibold">‹ Bugs</p>
              <div className="px-4 pt-2">
                <span className="font-mono text-[10px] text-neutral-500">STF-12</span>
                <p className="mt-1 text-[17px] font-bold leading-snug tracking-tight">Coupon discount lost after refresh</p>
                <div className="relative mt-2 h-6">
                  <span className={`${styles.statusOld} absolute inset-y-0 left-0 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-medium`}>
                    <span className="size-1.5 rounded-full bg-blue-600" />
                    In progress
                  </span>
                  <span className={`${styles.statusNew} absolute inset-y-0 left-0 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-medium`}>
                    <span className="size-1.5 rounded-full bg-purple-600" />
                    Ready for QA
                  </span>
                </div>
              </div>
              <div className="relative mx-3 mt-3 h-28 overflow-hidden rounded-2xl bg-white shadow-sm">
                <span className="absolute left-3 right-3 top-3 h-2.5 rounded bg-neutral-100" />
                <span className="absolute left-3 top-8 h-16 w-24 rounded-lg bg-gradient-to-br from-amber-200 to-amber-500" />
                <span className="absolute right-3 top-8 h-16 w-28 rounded-lg border border-neutral-100 bg-neutral-50" />
                <span className="absolute right-2 top-14 h-9 w-[7.5rem] rounded-lg border-2 border-red-500" />
              </div>
              <div className="mt-3 divide-y divide-neutral-100 bg-white text-[12px]">
                {[
                  ["Platform", "Website"],
                  ["Feature", "Checkout"],
                  ["Assignee", "Leo Park"],
                  ["API log", "1 failed call"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-2.5">
                    <span className="text-neutral-500">{k}</span>
                    <span className={k === "API log" ? "text-red-700" : ""}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-3 bottom-5">
                <div className="grid h-11 place-items-center rounded-xl bg-neutral-950 text-[13px] font-semibold text-white">Change status</div>
                <span className={`${styles.tap2} absolute left-1/2 top-0 size-11 -translate-x-1/2 rounded-full border-2 border-white bg-white/30`} />
              </div>
              <div className={`${styles.toast} absolute bottom-20 left-1/2 whitespace-nowrap rounded-lg bg-neutral-950 px-3 py-1.5 text-[11px] font-medium text-white`}>Moved to Ready for QA</div>
            </div>
            {/* The status sheet. */}
            <div className={`${styles.dim} absolute inset-0 bg-black/35`} />
            <div className={`${styles.sheet} absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-3 pb-6 pt-2 shadow-2xl`}>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-300" />
              <p className="px-2 pb-1 text-[11px] font-semibold text-neutral-500">Move to</p>
              {[
                ["Open", "#64748b"],
                ["In progress", "#2563eb"],
                ["Ready for QA", "#9333ea"],
                ["Reopened", "#dc2626"],
              ].map(([n, c]) => (
                <div key={n} className="relative flex items-center gap-2.5 border-b border-neutral-100 px-2 py-2.5 text-[13px]">
                  <span className="size-2 rounded-full" style={{ background: c }} />
                  {n}
                  {n === "In progress" && <span className="ml-auto text-[11px] text-neutral-400">Current</span>}
                  {n === "Ready for QA" && <span className={`${styles.tap3} absolute left-1/2 top-0 size-10 -translate-x-1/2 rounded-full border-2 border-white bg-black/20`} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-xs font-medium text-neutral-500">Concept preview · not available yet</p>
    </div>
  );
}

/* ---------------- Plans ---------------- */

function Plans() {
  const plans = [
    {
      name: "Personal",
      for: "For testing on your own",
      points: ["One personal project, ready when you sign up", "Report from the extension or the web", "Screenshots, recordings and API logs", "Connect your AI coding agent"],
      cta: "Start on your own",
      href: `${SIGNUP}?type=personal`,
      featured: false,
    },
    {
      name: "Organization",
      for: "For QA teams and developers",
      points: [
        "Projects with their own versions, platforms and features",
        "Statuses and severity levels for each project",
        "Invite developers, QA and admins by email",
        "Everything in Personal",
      ],
      cta: "Create your account",
      href: SIGNUP,
      featured: true,
    },
  ];
  return (
    <section id="plans" className="scroll-mt-24 space-y-12" aria-labelledby="plans-title">
      <SectionHead eyebrow="Two ways to start" title="Pick the account that fits how you work" body="You choose when you sign up. People you invite join your organization." />
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {plans.map((p, i) => (
          <Reveal
            key={p.name}
            delay={i * 100}
            className={`flex flex-col rounded-3xl p-8 ${p.featured ? "bg-neutral-950 text-white shadow-2xl shadow-black/20" : "border border-line bg-white"}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
              {p.featured && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-neutral-300">For teams</span>}
            </div>
            <p className={`mt-1 ${p.featured ? "text-neutral-400" : "text-muted"}`}>{p.for}</p>
            <ul className="mt-7 flex-1 space-y-3">
              {p.points.map((t) => (
                <li key={t} className={`flex gap-3 ${p.featured ? "text-neutral-200" : "text-neutral-700"}`}>
                  <Icon d={I.check} className={`mt-0.5 size-4 shrink-0 ${p.featured ? "text-emerald-400" : "text-emerald-600"}`} />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href={p.href}
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition ${
                p.featured ? "bg-white text-neutral-950 hover:bg-neutral-200" : "border border-line hover:border-neutral-400 hover:bg-neutral-50"
              }`}
            >
              {p.cta}
              <Icon d={I.arrow} className="size-4" />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24" aria-labelledby="faq-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <SectionHead eyebrow="FAQ" title="Questions, answered" body="Anything else? Create an account and look around. A project needs just a name, a key and its first version." center={false} />
        <Reveal className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-base font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted transition group-open:rotate-45" aria-hidden>
                  <Icon d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" className="size-4" />
                </span>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Closing ---------------- */

function ClosingCta() {
  return (
    <section aria-labelledby="cta-title">
      <Reveal className="relative isolate overflow-hidden rounded-[2rem] bg-neutral-950 px-6 py-16 text-center text-white sm:px-12 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          aria-hidden
        />
        <h2 id="cta-title" className="mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Catch every bug. Close every bug.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-neutral-300">Create your account, set up a project, and report your first bug from the browser.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={SIGNUP} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 sm:w-auto">
            Create your account
            <Icon d={I.arrow} className="size-4" />
          </Link>
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/10 sm:w-auto">
            Sign in
          </Link>
        </div>
      </Reveal>
      <footer className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-line pt-8 text-sm text-muted sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md bg-neutral-950 text-sm font-semibold text-white">U</span>
          <span className="font-semibold text-foreground">UpTrack</span>
          <span className="hidden sm:inline">· Every bug, from report to fix.</span>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2" aria-label="Footer">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#faq" className="hover:text-foreground">
            FAQ
          </a>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href={SIGNUP} className="font-medium text-foreground hover:underline">
            Create account
          </Link>
        </nav>
      </footer>
    </section>
  );
}
