// Runs in the extension's isolated world on every page. Collects what page-recorder.ts reports into a
// rolling buffer and hands it to the background worker when a bug is captured.

import { pageInfo } from "./shared/page-info";
import { isApiCall, LOAD_FAILED, type CaptureLog, type ConsoleEntry, type NetworkEntry } from "./shared/types";

const MAX_CALLS = 500;
const MAX_RESOURCES = 500;
const MAX_CONSOLE = 200;

// API calls and the files the page loads are kept apart, so a page full of images can't push the calls out.
const calls: NetworkEntry[] = [];
const resources: NetworkEntry[] = [];
const consoleEntries: ConsoleEntry[] = [];

const byTime = (a: NetworkEntry, b: NetworkEntry) => a.startedAt - b.startedAt;

/**
 * Everything recorded, oldest first. A file's element reports a failed load separately from its timing
 * entry, so the failure is folded into the file's own entry when there is one.
 */
function networkLog(keepCalls = calls.length, keepResources = resources.length): NetworkEntry[] {
  const files = resources.slice(-keepResources);
  const failures = files.filter((e) => e.error === LOAD_FAILED);
  const merged = files.filter((e) => {
    if (e.error === LOAD_FAILED) return !files.some((o) => o !== e && o.url === e.url && o.error !== LOAD_FAILED);
    return true;
  });
  for (const f of failures) {
    const own = merged.find((e) => e !== f && e.url === f.url && e.error !== LOAD_FAILED);
    if (own && own.status < 400) own.error = LOAD_FAILED;
  }
  return [...calls.slice(-keepCalls), ...merged].sort(byTime);
}

/**
 * False once the extension is reloaded or updated: this copy of the script stays in the page but can no
 * longer reach the extension, and calling chrome.runtime then throws "Extension context invalidated".
 */
function connected(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function record(event: Event) {
  // Left behind by an extension reload: stop collecting calls nobody can ask for.
  if (!connected()) {
    document.removeEventListener("uptrack:record", record);
    return;
  }
  const detail = (event as CustomEvent).detail;
  if (typeof detail !== "string") return;
  try {
    const record = JSON.parse(detail) as { kind: "network"; data: NetworkEntry } | { kind: "console"; data: ConsoleEntry };
    if (record.kind === "network") {
      const list = isApiCall(record.data) ? calls : resources;
      list.push(record.data);
      if (list.length > (list === calls ? MAX_CALLS : MAX_RESOURCES)) list.shift();
    } else if (record.kind === "console") {
      consoleEntries.push(record.data);
      if (consoleEntries.length > MAX_CONSOLE) consoleEntries.shift();
    }
  } catch {}
}
document.addEventListener("uptrack:record", record);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "get-log") return false;
  const log: CaptureLog = { network: networkLog(), console: [...consoleEntries] };
  sendResponse({ log, page: pageInfo() });
  return false;
});

// A full page load wipes this buffer, so hand the calls so far to the background worker first. That keeps
// the API log of a recording that moves across pages. Bodies are shortened to keep the stash small.
window.addEventListener("pagehide", () => {
  if (!connected() || (calls.length === 0 && resources.length === 0 && consoleEntries.length === 0)) return;
  const shorten = (text?: string) => (text && text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text);
  const log: CaptureLog = {
    network: networkLog(150, 150).map((e) => ({ ...e, requestBody: shorten(e.requestBody), responseBody: shorten(e.responseBody) })),
    console: consoleEntries.slice(-50),
  };
  try {
    chrome.runtime.sendMessage({ type: "stash-log", log }).catch(() => {});
  } catch {
    // The extension went away between the check and the call.
  }
});
