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
  /** When the current pause began; null while recording. */
  pausedAt: number | null;
  /** Time spent paused before the current pause, in milliseconds. */
  pausedMs: number;
}

/** How long a recording has run, leaving out pauses. */
export const recordedMs = (r: RecordingState, now = Date.now()) => (r.pausedAt ?? now) - r.startedAt - r.pausedMs;

/** Messages the popup, offscreen document and content scripts send to the background worker. */
export type BackgroundMessage =
  | { type: "screenshot"; tabId: number; windowId: number }
  | { type: "record-start"; tabId: number }
  | { type: "record-stop" }
  | { type: "record-pause" }
  | { type: "record-resume" }
  | { type: "state" }
  | { type: "recording-done"; draftId: string }
  | { type: "recording-failed"; error: string }
  | { type: "stash-log"; log: CaptureLog };

export type OffscreenMessage =
  | { target: "offscreen"; type: "start"; streamId: string; maxMs: number }
  | { target: "offscreen"; type: "stop" }
  | { target: "offscreen"; type: "pause" }
  | { target: "offscreen"; type: "resume" };

/** Sent to the recorded tab's toolbar. */
export type TabMessage = { type: "recording-ended" } | { type: "recording-state"; recording: RecordingState };

export const MAX_RECORDING_MS = 5 * 60 * 1000;
