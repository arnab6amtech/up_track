// Runs in the page's own JavaScript world from the very start of every page load. It watches the page's
// fetch/XHR calls (in full), WebSockets, everything else the page loads (from resource timing: documents,
// styles, scripts, fonts, images, media, ...) and console errors, and hands each one to relay.ts as a JSON
// string, after hiding secrets. It only observes: every wrapper calls the original and never throws into
// page code.

import { LOAD_FAILED, type ConsoleEntry, type NetworkEntry, type NetworkType } from "./shared/types";

const EVENT = "uptrack:record";
const MAX_BODY = 20_000;
const MAX_READ = 2_000_000;
const HIDDEN = "[hidden by UpTrack]";

const SECRET_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token)$/i;
const SECRET_KEY = /pass(word|wd)?|secret|token|api[-_]?key|authorization|otp|\bpin\b|cvv|cvc|card[-_]?number|ssn/i;
const TEXTUAL = /json|text\/|xml|javascript|x-www-form-urlencoded|graphql/i;

type Recorded = { kind: "network"; data: NetworkEntry } | { kind: "console"; data: ConsoleEntry };

function emit(record: Recorded) {
  try {
    // A string crosses from the page's world to the extension's reliably; objects may not.
    document.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify(record) }));
  } catch {}
}

function hideSecrets(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => hideSecrets(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? HIDDEN : hideSecrets(v, depth + 1)]),
  );
}

function clip(text: string): string {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…[truncated]` : text;
}

function redactBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return clip(JSON.stringify(hideSecrets(JSON.parse(trimmed))));
    } catch {}
  } else if (/^[\w.%[\]-]+=[^\s]*(&[\w.%[\]-]+=[^\s]*)*$/.test(trimmed)) {
    const params = new URLSearchParams(trimmed);
    for (const key of [...params.keys()]) if (SECRET_KEY.test(key)) params.set(key, HIDDEN);
    return clip(params.toString());
  }
  return clip(text);
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw, location.href);
    for (const key of [...url.searchParams.keys()]) if (SECRET_KEY.test(key)) url.searchParams.set(key, HIDDEN);
    return url.href;
  } catch {
    return raw;
  }
}

function headerObject(headers: HeadersInit | Headers | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  try {
    new Headers(headers).forEach((value, name) => {
      out[name] = SECRET_HEADER.test(name) ? HIDDEN : value;
    });
  } catch {}
  return out;
}

function describeBody(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return redactBody(body);
  if (body instanceof URLSearchParams) return redactBody(body.toString());
  if (body instanceof FormData) {
    const fields = [...body.keys()];
    return `[form data with fields: ${[...new Set(fields)].join(", ")}]`;
  }
  if (body instanceof Blob) return `[binary, ${body.size} bytes]`;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return `[binary, ${(body as ArrayBuffer).byteLength} bytes]`;
  return "[body]";
}

const readable = (contentType: string | null) => !!contentType && TEXTUAL.test(contentType) && !/event-stream/.test(contentType);

const ext = (pattern: string) => new RegExp(`\\.(${pattern})([?#]|$)`, "i");
const WASM = ext("wasm");

// ---- fetch ----

const originalFetch = window.fetch;
window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
  const [input, init] = args;
  const startedAt = Date.now();
  const t0 = performance.now();
  let base: Pick<NetworkEntry, "type" | "method" | "url" | "requestHeaders" | "requestBody"> | null = null;
  try {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    base = {
      // WebAssembly is fetched too; DevTools lists it on its own.
      type: WASM.test(url) ? "wasm" : "fetch",
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: redactUrl(url),
      requestHeaders: headerObject(init?.headers ?? request?.headers),
      requestBody: describeBody(init?.body),
    };
  } catch {}

  const result = originalFetch.apply(this, args);
  if (base) {
    const entry = base;
    result.then(
      async (res) => {
        let responseBody: string | undefined;
        try {
          const type = res.headers.get("content-type");
          if (readable(type) && Number(res.headers.get("content-length") ?? 0) <= MAX_READ) {
            responseBody = redactBody(await res.clone().text());
          }
        } catch {}
        emit({
          kind: "network",
          data: {
            ...entry,
            type: /wasm/.test(res.headers.get("content-type") ?? "") ? "wasm" : entry.type,
            status: res.status,
            statusText: res.statusText,
            startedAt,
            durationMs: performance.now() - t0,
            responseHeaders: headerObject(res.headers),
            responseBody,
          },
        });
      },
      (err: unknown) =>
        emit({
          kind: "network",
          data: { ...entry, status: 0, startedAt, durationMs: performance.now() - t0, error: String((err as Error)?.message ?? err) },
        }),
    );
  }
  return result;
};

// ---- XMLHttpRequest ----

interface XhrInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
}
const xhrInfo = new WeakMap<XMLHttpRequest, XhrInfo>();
const proto = XMLHttpRequest.prototype;
const originalOpen = proto.open as (...args: unknown[]) => void;
const originalSend = proto.send;
const originalSetHeader = proto.setRequestHeader;

proto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
  try {
    xhrInfo.set(this, { method: String(args[0]).toUpperCase(), url: redactUrl(String(args[1])), headers: {} });
  } catch {}
  return originalOpen.apply(this, args);
} as typeof proto.open;

proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
  const info = xhrInfo.get(this);
  if (info) info.headers[name.toLowerCase()] = SECRET_HEADER.test(name) ? HIDDEN : value;
  return originalSetHeader.call(this, name, value);
};

proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  const info = xhrInfo.get(this);
  if (info) {
    const startedAt = Date.now();
    const t0 = performance.now();
    const requestBody = describeBody(body);
    this.addEventListener("loadend", () => {
      let responseBody: string | undefined;
      const responseHeaders: Record<string, string> = {};
      try {
        for (const line of this.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
          const at = line.indexOf(":");
          if (at > 0) {
            const name = line.slice(0, at).trim().toLowerCase();
            responseHeaders[name] = SECRET_HEADER.test(name) ? HIDDEN : line.slice(at + 1).trim();
          }
        }
        if ((this.responseType === "" || this.responseType === "text") && readable(this.getResponseHeader("content-type"))) {
          responseBody = redactBody(this.responseText);
        } else if (this.responseType === "json" && this.response != null) {
          responseBody = redactBody(JSON.stringify(this.response));
        }
      } catch {}
      emit({
        kind: "network",
        data: {
          type: "xhr",
          method: info.method,
          url: info.url,
          status: this.status,
          statusText: this.statusText,
          startedAt,
          durationMs: performance.now() - t0,
          requestHeaders: info.headers,
          responseHeaders,
          requestBody,
          responseBody,
          error: this.status === 0 ? "The request failed, was blocked or was cancelled" : undefined,
        },
      });
    });
  }
  return originalSend.call(this, body);
};

// ---- WebSockets ----

const OriginalWebSocket = window.WebSocket;
if (OriginalWebSocket) {
  window.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget) as WebSocket;
      try {
        const startedAt = Date.now();
        const t0 = performance.now();
        const base = { type: "websocket" as const, method: "GET", url: redactUrl(String(args[0])), startedAt };
        let opened = false;
        socket.addEventListener("open", () => {
          opened = true;
          emit({ kind: "network", data: { ...base, status: 101, statusText: "Switching Protocols", durationMs: performance.now() - t0 } });
        });
        socket.addEventListener("error", () => {
          if (!opened) emit({ kind: "network", data: { ...base, status: 0, durationMs: performance.now() - t0, error: "The connection failed" } });
        });
      } catch {}
      return socket;
    },
  });
}

// ---- Everything else the page loads ----

const CSS = ext("css");
const JS = ext("m?js|cjs");
const FONT = ext("woff2?|ttf|otf|eot");
const IMAGE = ext("png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?");
const MEDIA = ext("mp4|webm|ogg|ogv|mp3|wav|m4a|aac|flac|m3u8|mpd|vtt");
const MANIFEST = /(\.webmanifest|manifest\.json)([?#]|$)/i;

/** DevTools' grouping, from what started the request, then the content type, then the file name. */
function resourceType(e: PerformanceResourceTiming): NetworkType | null {
  if (e.entryType === "navigation") return "document";
  const url = e.name;
  const contentType = (e as PerformanceResourceTiming & { contentType?: string }).contentType ?? "";
  switch (e.initiatorType) {
    case "fetch":
    case "xmlhttprequest":
      return null; // Recorded in full by the wrappers above.
    case "iframe":
    case "frame":
      return "document";
    case "script":
      return "script";
    case "img":
    case "image":
    case "input":
      return "image";
    case "video":
    case "audio":
    case "track":
      return "media";
  }
  if (/css/.test(contentType) || CSS.test(url)) return "stylesheet";
  if (/javascript|ecmascript/.test(contentType) || JS.test(url)) return "script";
  if (/font/.test(contentType) || FONT.test(url)) return "font";
  if (/^image\//.test(contentType) || IMAGE.test(url)) return "image";
  if (/^(video|audio)\//.test(contentType) || MEDIA.test(url)) return "media";
  if (/manifest/.test(contentType) || MANIFEST.test(url)) return "manifest";
  if (/wasm/.test(contentType) || WASM.test(url)) return "wasm";
  return "other";
}

function recordResource(e: PerformanceResourceTiming) {
  // Chrome hands over the page's own entry early (still loading) and again once it's complete; keep the latter.
  if (e.entryType === "navigation" && !(e as PerformanceNavigationTiming).loadEventEnd) return;
  const type = resourceType(e);
  if (!type) return;
  emit({
    kind: "network",
    data: {
      type,
      method: "GET",
      url: redactUrl(e.name),
      // Chrome reports the status for same-origin and CORS-enabled files; 0 means it didn't say.
      status: (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0,
      startedAt: Math.round(performance.timeOrigin + e.startTime),
      durationMs: e.duration,
      sizeBytes: e.transferSize || e.encodedBodySize || undefined,
    },
  });
}

try {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) recordResource(entry as PerformanceResourceTiming);
  });
  observer.observe({ type: "resource", buffered: true });
  observer.observe({ type: "navigation", buffered: true });
} catch {}

function failedElement(target: EventTarget | null): { type: NetworkType; url: string } | null {
  if (!(target instanceof Element)) return null;
  const el = target as HTMLElement & { currentSrc?: string; src?: string; href?: string; rel?: string; as?: string };
  const url = el.currentSrc || el.src || el.href;
  if (!url) return null;
  switch (el.tagName) {
    case "IMG":
    case "IMAGE":
      return { type: "image", url };
    case "SCRIPT":
      return { type: "script", url };
    case "VIDEO":
    case "AUDIO":
    case "SOURCE":
    case "TRACK":
      return { type: "media", url };
    case "IFRAME":
      return { type: "document", url };
    case "LINK": {
      const rel = (el.rel || "").toLowerCase();
      if (rel.includes("stylesheet")) return { type: "stylesheet", url };
      if (rel.includes("manifest")) return { type: "manifest", url };
      if (rel.includes("icon")) return { type: "image", url };
      if (el.as === "font") return { type: "font", url };
      if (el.as === "script") return { type: "script", url };
      return { type: "other", url };
    }
  }
  return null;
}

// Files that fail to load fire "error" on their element, which reaches window only while capturing.
window.addEventListener(
  "error",
  (e: Event) => {
    // Script errors are ErrorEvents (handled below); a file that failed to load fires a plain Event.
    if (e instanceof ErrorEvent) return;
    const failed = failedElement(e.target);
    if (failed) {
      emit({ kind: "network", data: { ...failed, method: "GET", url: redactUrl(failed.url), status: 0, startedAt: Date.now(), durationMs: 0, error: LOAD_FAILED } });
    }
  },
  true,
);

// ---- Console errors and uncaught exceptions ----

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    const json = JSON.stringify(arg);
    return json === undefined ? String(arg) : json.length > 2000 ? `${json.slice(0, 2000)}…` : json;
  } catch {
    return String(arg);
  }
}

for (const level of ["error", "warn"] as const) {
  const original = console[level];
  console[level] = function (this: Console, ...args: unknown[]) {
    try {
      emit({
        kind: "console",
        data: {
          level,
          message: args.map(formatArg).join(" ").slice(0, 10_000),
          at: Date.now(),
          stack: args.find((a): a is Error => a instanceof Error)?.stack,
          source: "console",
        },
      });
    } catch {}
    return original.apply(this, args);
  };
}

window.addEventListener(
  "error",
  (e) => {
    // Failed images and scripts also fire "error" here, but as plain Events; only scripts throw ErrorEvents.
    if (!(e instanceof ErrorEvent)) return;
    emit({
      kind: "console",
      data: {
        level: "error",
        message: e.message || formatArg(e.error),
        at: Date.now(),
        stack: (e.error as Error | undefined)?.stack ?? (e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : undefined),
        source: "exception",
      },
    });
  },
  true,
);

window.addEventListener("unhandledrejection", (e) => {
  emit({
    kind: "console",
    data: {
      level: "error",
      message: `Unhandled promise rejection: ${formatArg(e.reason)}`,
      at: Date.now(),
      stack: (e.reason as Error | undefined)?.stack,
      source: "rejection",
    },
  });
});
