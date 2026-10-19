// Runs in the extension's isolated world on every page. Collects what page-recorder.ts reports into a
// rolling buffer and hands it to the background worker when a bug is captured.

import { pageInfo } from "./shared/page-info";
import type { CaptureLog, ConsoleEntry, NetworkEntry } from "./shared/types";

const MAX_NETWORK = 500;
const MAX_CONSOLE = 200;

const network: NetworkEntry[] = [];
const consoleEntries: ConsoleEntry[] = [];

document.addEventListener("uptrack:record", (event) => {
  const detail = (event as CustomEvent).detail;
  if (typeof detail !== "string") return;
  try {
    const record = JSON.parse(detail) as { kind: "network"; data: NetworkEntry } | { kind: "console"; data: ConsoleEntry };
    if (record.kind === "network") {
      network.push(record.data);
      if (network.length > MAX_NETWORK) network.shift();
    } else if (record.kind === "console") {
      consoleEntries.push(record.data);
      if (consoleEntries.length > MAX_CONSOLE) consoleEntries.shift();
    }
  } catch {}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "get-log") return false;
  const log: CaptureLog = { network: [...network], console: [...consoleEntries] };
  sendResponse({ log, page: pageInfo() });
  return false;
});

// A full page load wipes this buffer, so hand the calls so far to the background worker first. That keeps
// the API log of a recording that moves across pages. Bodies are shortened to keep the stash small.
window.addEventListener("pagehide", () => {
  if (network.length === 0 && consoleEntries.length === 0) return;
  const shorten = (text?: string) => (text && text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text);
  const log: CaptureLog = {
    network: network.slice(-150).map((e) => ({ ...e, requestBody: shorten(e.requestBody), responseBody: shorten(e.responseBody) })),
    console: consoleEntries.slice(-50),
  };
  chrome.runtime.sendMessage({ type: "stash-log", log }).catch(() => {});
});
