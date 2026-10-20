/** Shapes shared by the capture API, the share page and the browser extension's uploads. */


/**
 * What a request loaded, grouped the way Chrome DevTools does. Fetch/XHR calls are recorded in full (headers
 * and bodies); the rest come from the browser's resource timing, which gives URL, timing and size only.
 */
export const NETWORK_TYPES = [
  "fetch",
  "xhr",
  "document",
  "stylesheet",
  "script",
  "font",
  "image",
  "media",
  "manifest",
  "websocket",
  "wasm",
  "other",
] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];

/** The filter chips over a network log, as in DevTools. */
export const NETWORK_FILTERS: { id: string; label: string; types: NetworkType[] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "xhr", label: "Fetch/XHR", types: ["fetch", "xhr"] },
  { id: "doc", label: "Doc", types: ["document"] },
  { id: "css", label: "CSS", types: ["stylesheet"] },
  { id: "js", label: "JS", types: ["script"] },
  { id: "font", label: "Font", types: ["font"] },
  { id: "img", label: "Img", types: ["image"] },
  { id: "media", label: "Media", types: ["media"] },
  { id: "manifest", label: "Manifest", types: ["manifest"] },
  { id: "socket", label: "Socket", types: ["websocket"] },
  { id: "wasm", label: "Wasm", types: ["wasm"] },
  { id: "other", label: "Other", types: ["other"] },
];

export const inFilter = (e: NetworkEntry, filterId: string) => {
  const types = NETWORK_FILTERS.find((f) => f.id === filterId)?.types;
  return !types || types.includes(e.type);
};

/** The error on files whose element reported a failed load (the browser gives no reason). */
export const LOAD_FAILED = "Failed to load";

/** API calls proper (fetch, XHR and WebSockets), as opposed to the files the page loaded. */
export const isApiCall = (e: NetworkEntry) => e.type === "fetch" || e.type === "xhr" || e.type === "websocket";

export interface NetworkEntry {
  type: NetworkType;
  method: string;
  url: string;
  /**
   * 0 when an API call never got a response (network error, CORS, aborted). For other resources 0 can also
   * mean the browser didn't say (a cross-origin file), so it only counts as failed with an error.
   */
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
  /** Bytes transferred, when the browser reports it. */
  sizeBytes?: number;
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

/** A moment the reporter marked in a recording, in milliseconds from its start, with an optional note. */
export interface VideoMarker {
  atMs: number;
  label?: string;
}

/** What the extension sends as the `meta` part of an upload to /api/captures. */
export interface CaptureUploadMeta {
  projectId: string;
  versionId: string;
  /** Required when the project has platforms. */
  platformId?: string;
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
    markers?: VideoMarker[];
  };
}

/** The projects a token's owner can report to, for the extension's pickers (GET /api/captures/projects). */
export interface ReportableProject {
  id: string;
  key: string;
  name: string;
  organization: { slug: string; name: string };
  versions: { id: string; name: string; status: string }[];
  /** Empty when the project doesn't split into platforms. */
  platforms: { id: string; name: string }[];
  components: { id: string; name: string }[];
}

export const isFailed = (e: NetworkEntry) =>
  Boolean(e.error) || e.status >= 400 || (e.status === 0 && (e.type === "fetch" || e.type === "xhr"));

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
