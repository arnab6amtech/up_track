import type { CaptureLog, PageInfo } from "../../../src/lib/capture-types";

export type { CaptureLog, ConsoleEntry, NetworkEntry, NetworkType, PageInfo, ReportableProject } from "../../../src/lib/capture-types";
export { describeUserAgent, inFilter, isApiCall, isFailed, LOAD_FAILED, NETWORK_FILTERS, PRIORITIES, SEVERITIES } from "../../../src/lib/capture-types";

/** A screenshot or recording waiting in the editor to be annotated and reported. */
export interface Draft {
  id: string;
  kind: "image" | "video";
  blob: Blob;
  width?: number;
  height?: number;
  durationMs?: number;
  log: CaptureLog;
  page: PageInfo | null;
  /** False when the page was open before the extension was installed, so nothing was recorded. */
  logAvailable: boolean;
  createdAt: number;
}

export interface RecordingState {
  tabId: number;
  startedAt: number;
}

/** Messages the popup, offscreen document and content scripts send to the background worker. */
export type BackgroundMessage =
  | { type: "screenshot"; tabId: number; windowId: number }
  | { type: "record-start"; tabId: number }
  | { type: "record-stop" }
  | { type: "state" }
  | { type: "recording-done"; draftId: string }
  | { type: "recording-failed"; error: string }
  | { type: "stash-log"; log: CaptureLog };

export type OffscreenMessage =
  | { target: "offscreen"; type: "start"; streamId: string; maxMs: number }
  | { target: "offscreen"; type: "stop" };

export const MAX_RECORDING_MS = 5 * 60 * 1000;
