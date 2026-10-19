/** Shapes shared by the capture API, the share page and the browser extension's uploads. */

/** The built-in workbook that lists bugs reported with the browser extension. */
export const CAPTURES_WORKBOOK_ID = "reported";
export const CAPTURES_WORKBOOK_NAME = "Reported bugs";
export const CAPTURES_TAB_SLUG = "reported";

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

export interface CaptureMedia {
  kind: "image" | "video";
  file: string;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Part of the recording viewers are shown; the full file is kept. */
  trimStartMs?: number;
  trimEndMs?: number;
}

export interface Capture {
  /** Random and unguessable: it's the share link. */
  id: string;
  /** Sequential, for the bug list ("reported-12"). */
  number: number;
  createdAt: string;
  reporter: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  module: string;
  status: string;
  media: CaptureMedia[];
  page: PageInfo;
  counts: { requests: number; failedRequests: number; consoleErrors: number };
}

/** What the extension sends as the `meta` part of an upload. */
export interface CaptureUploadMeta {
  title: string;
  description?: string;
  severity?: string;
  priority?: string;
  module?: string;
  page: PageInfo;
  media: Omit<CaptureMedia, "file" | "mime">;
}

export const isFailed = (e: NetworkEntry) => e.status === 0 || e.status >= 400;

export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

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
