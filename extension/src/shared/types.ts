import type { CaptureLog, PageInfo, VideoMarker } from "../../../src/lib/capture-types";

export type { CaptureLog, ConsoleEntry, NetworkEntry, NetworkType, PageInfo, ReportableProject, VideoMarker } from "../../../src/lib/capture-types";
export { describeUserAgent, inFilter, isApiCall, isFailed, LOAD_FAILED, NETWORK_FILTERS, PRIORITIES } from "../../../src/lib/capture-types";

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
  /** Recordings: moments marked while recording. */
  markers?: VideoMarker[];
  createdAt: number;
}

export interface RecordingState {
  tabId: number;
  startedAt: number;
  /** When the current pause began; null while recording. */
  pausedAt: number | null;
  /** Time spent paused before the current pause, in milliseconds. */
  pausedMs: number;
  /** Moments the reporter marked ("the bug happens here"), as recorded time in milliseconds. */
  marks: number[];
}

/** How long a recording has run, leaving out pauses. */
export const recordedMs = (r: RecordingState, now = Date.now()) => (r.pausedAt ?? now) - r.startedAt - r.pausedMs;

/** Messages the popup, offscreen document and content scripts send to the background worker. */
export type BackgroundMessage =
  | { type: "screenshot"; tabId: number; windowId: number }
  | { type: "record-start"; tabId: number }
  | { type: "record-stop" }
  | { type: "record-mark" }
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
