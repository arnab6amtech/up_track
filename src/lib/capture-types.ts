/** Shapes shared by the capture API, the share page and the browser extension's uploads. */


export interface NetworkEntry {
  type: "fetch" | "xhr";
  method: string;
  url: string;
  /** 0 when the request never got a response (network error, CORS, aborted). */
  status: number;
  statusText?: string;
  /** Epoch milliseconds. */
  startedAt: number;
  durationMs: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  /** Why the request failed, when it did. */
  error?: string;
}

export interface ConsoleEntry {
  level: "error" | "warn";
  message: string;
  /** Epoch milliseconds. */
  at: number;
  stack?: string;
  source: "console" | "exception" | "rejection";
}

export interface PageInfo {
  url: string;
  title: string;
  userAgent: string;
  viewport: { width: number; height: number };
  screen?: { width: number; height: number };
  devicePixelRatio: number;
  language: string;
  timezone: string;
}

export interface CaptureLog {
  network: NetworkEntry[];
  console: ConsoleEntry[];
}

/** What the extension sends as the `meta` part of an upload to /api/captures. */
export interface CaptureUploadMeta {
  projectId: string;
  versionId: string;
  componentId?: string;
  title: string;
  description?: string;
  severity?: Severity;
  priority?: Priority;
  page: PageInfo;
  media: {
    kind: "image" | "video";
    width?: number;
    height?: number;
    durationMs?: number;
    /** Part of a recording viewers are shown; the full file is kept. */
    trimStartMs?: number;
    trimEndMs?: number;
  };
}

/** The projects a token's owner can report to, for the extension's pickers (GET /api/captures/projects). */
export interface ReportableProject {
  id: string;
  key: string;
  name: string;
  organization: { slug: string; name: string };
  versions: { id: string; name: string; status: string }[];
  components: { id: string; name: string }[];
}

export const isFailed = (e: NetworkEntry) => e.status === 0 || e.status >= 400;

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Priority = (typeof PRIORITIES)[number];

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
];

const SYSTEMS: [string, RegExp][] = [
  ["Windows", /Windows NT/],
  ["Android", /Android/],
  ["iOS", /iPhone|iPad/],
  ["macOS", /Mac OS X/],
  ["ChromeOS", /CrOS/],
  ["Linux", /Linux/],
];

/** "Chrome 155 · macOS" from a user agent string; good enough for a bug report, not for analytics. */
export function describeUserAgent(ua: string): string {
  const browser = BROWSERS.map(([name, re]) => [name, ua.match(re)?.[1]] as const).find(([, v]) => v);
  const os = SYSTEMS.find(([, re]) => re.test(ua))?.[0] ?? "Unknown OS";
  return `${browser ? `${browser[0]} ${browser[1]}` : "Unknown browser"} · ${os}`;
}
