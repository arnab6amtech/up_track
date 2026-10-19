// Offscreen document: MV3 service workers can't record media, so the tab recording happens here.

import fixWebmDuration from "fix-webm-duration";
import { saveDraft } from "./shared/drafts";
import type { OffscreenMessage } from "./shared/types";

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let stopTimer: ReturnType<typeof setTimeout> | undefined;
let maxMs = 0;
// Pauses don't count towards the length or the time limit.
let pausedTotal = 0;
let pausedAt: number | null = null;
let discard = false;

const elapsed = () => (pausedAt ?? performance.now()) - startedAt - pausedTotal;

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;
  if (message.type === "prepare") {
    prepare(message.streamId, message.maxMs).then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  }
  if (message.type === "begin") begin();
  else if (message.type === "cancel") cancel();
  else if (message.type === "pause") pause();
  else if (message.type === "resume") resume();
  else stop();
  sendResponse({ ok: true });
  return false;
});

function stop() {
  if (!recorder) return;
  // Never started: nothing to keep.
  if (recorder.state === "inactive") return cancel();
  recorder.stop();
}

/** Ends without keeping anything (the reporter cancelled before or during the recording). */
function cancel() {
  discard = true;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  else release();
}

function release() {
  clearTimeout(stopTimer);
  stream?.getTracks().forEach((t) => t.stop());
  chunks = [];
  recorder = null;
  stream = null;
}

/** Starts recording the stream opened by prepare(). */
function begin() {
  if (recorder?.state !== "inactive") return;
  startedAt = performance.now();
  recorder.start(1000);
  stopTimer = setTimeout(stop, maxMs);
}

function pause() {
  if (recorder?.state !== "recording") return;
  recorder.pause();
  pausedAt = performance.now();
  clearTimeout(stopTimer);
}

function resume() {
  if (recorder?.state !== "paused" || pausedAt === null) return;
  pausedTotal += performance.now() - pausedAt;
  pausedAt = null;
  recorder.resume();
  stopTimer = setTimeout(stop, Math.max(0, maxMs - elapsed()));
}

/**
 * Size limits only. Chrome picks a fixed frame size when min and max match (or share a shape) and puts the
 * page in black bars when the shapes differ; with limits of different shapes it sizes each frame to the
 * captured page itself, scaled down to fit.
 */
const FRAME_LIMITS = { minWidth: 160, minHeight: 90, maxWidth: 1920, maxHeight: 1920 };

/** Opens the tab's stream and sets up the recorder; begin() starts it. */
async function prepare(streamId: string, limitMs: number) {
  maxMs = limitMs;
  pausedTotal = 0;
  pausedAt = null;
  discard = false;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // Chrome's tab-capture constraints aren't in the standard typings.
    video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId, maxFrameRate: 30, ...FRAME_LIMITS } } as MediaTrackConstraints,
  });
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => void finish();
  // Stop if the tab goes away or Chrome ends the capture.
  stream.getVideoTracks()[0]?.addEventListener("ended", stop);
}

async function finish() {
  clearTimeout(stopTimer);
  if (discard) return release();
  const durationMs = Math.round(elapsed());
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  stream?.getTracks().forEach((t) => t.stop());
  try {
    // MediaRecorder leaves the duration out of WebM files, which stops players from seeking.
    const blob = await fixWebmDuration(new Blob(chunks, { type: "video/webm" }), durationMs, { logger: false });
    const id = crypto.randomUUID();
    await saveDraft({
      id,
      kind: "video",
      blob,
      width: settings?.width,
      height: settings?.height,
      durationMs,
      log: { network: [], console: [] },
      page: null,
      logAvailable: false,
      createdAt: Date.now(),
    });
    await chrome.runtime.sendMessage({ type: "recording-done", draftId: id });
  } catch (err) {
    await chrome.runtime.sendMessage({ type: "recording-failed", error: String(err) });
  } finally {
    chunks = [];
    recorder = null;
    stream = null;
  }
}
