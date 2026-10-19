// Background service worker: takes screenshots, drives tab recording through the offscreen document,
// gathers the page's API log and opens the editor.

import { deleteOldDrafts, getDraft, saveDraft } from "./shared/drafts";
import { pageInfo } from "./shared/page-info";
import { isRestricted } from "./shared/restricted";
import {
  MAX_RECORDING_MS,
  type BackgroundMessage,
  type CaptureLog,
  type OffscreenMessage,
  type PageInfo,
  type RecordingState,
} from "./shared/types";

const RECORDING_KEY = "recording";
const stashKey = (tabId: number) => `stash:${tabId}`;
const MAX_LOG_ENTRIES = 500;

chrome.runtime.onInstalled.addListener(() => void deleteOldDrafts());
chrome.runtime.onStartup.addListener(() => void deleteOldDrafts());

chrome.runtime.onMessage.addListener((message: BackgroundMessage | OffscreenMessage, sender, sendResponse) => {
  if ("target" in message) return false; // For the offscreen document.
  handle(message, sender).then(
    (result) => sendResponse({ ok: true, ...result }),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session.remove(stashKey(tabId));
  const recording = await getRecording();
  if (recording?.tabId === tabId) await sendToOffscreen({ target: "offscreen", type: "stop" }).catch(() => {});
});

async function handle(message: BackgroundMessage, sender: chrome.runtime.MessageSender): Promise<object | void> {
  switch (message.type) {
    case "screenshot":
      return takeScreenshot(message.tabId, message.windowId);
    case "record-start":
      return startRecording(message.tabId);
    case "record-stop":
      await sendToOffscreen({ target: "offscreen", type: "stop" });
      return;
    case "state":
      return { recording: await getRecording() };
    case "recording-done":
      return finishRecording(message.draftId);
    case "recording-failed":
      await clearRecording();
      return;
    case "stash-log":
      if (sender.tab?.id !== undefined) await stashLog(sender.tab.id, message.log);
      return;
  }
}

// ---- Screenshots ----

async function takeScreenshot(tabId: number, windowId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (isRestricted(tab.url)) throw new Error("Chrome doesn't allow capturing this page.");
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const { log, page, logAvailable } = await collectLog(tabId);
  const id = crypto.randomUUID();
  await saveDraft({
    id,
    kind: "image",
    blob,
    width: bitmap.width,
    height: bitmap.height,
    log,
    page,
    logAvailable,
    createdAt: Date.now(),
  });
  bitmap.close();
  await openEditor(id, tab);
}

// ---- Recording ----

async function getRecording(): Promise<RecordingState | null> {
  return ((await chrome.storage.session.get(RECORDING_KEY))[RECORDING_KEY] as RecordingState | undefined) ?? null;
}

async function clearRecording() {
  await chrome.storage.session.remove(RECORDING_KEY);
  await chrome.action.setBadgeText({ text: "" });
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}

async function startRecording(tabId: number) {
  if (await getRecording()) throw new Error("A recording is already running.");
  const tab = await chrome.tabs.get(tabId);
  if (isRestricted(tab.url)) throw new Error("Chrome doesn't allow recording this page.");

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Records the tab the user asked to capture as a bug report.",
    });
  }
  const started = (await sendToOffscreen({
    target: "offscreen",
    type: "start",
    streamId,
    maxMs: MAX_RECORDING_MS,
  })) as { ok: boolean; error?: string };
  if (!started?.ok) {
    await clearRecording();
    throw new Error(started?.error ?? "The recording couldn't start.");
  }

  const state: RecordingState = { tabId, startedAt: Date.now() };
  await chrome.storage.session.set({ [RECORDING_KEY]: state });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setBadgeText({ text: "REC" });
  return { recording: state };
}

async function finishRecording(draftId: string) {
  const recording = await getRecording();
  await clearRecording();
  const draft = await getDraft(draftId);
  if (!draft || !recording) return;
  const tab = await chrome.tabs.get(recording.tabId).catch(() => null);
  const { log, page, logAvailable } = tab
    ? await collectLog(recording.tabId)
    : { log: { network: [], console: [] }, page: null, logAvailable: false };
  await saveDraft({ ...draft, log, page, logAvailable });
  await openEditor(draftId, tab ?? undefined);
}

function sendToOffscreen(message: OffscreenMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

// ---- API log ----

async function stashLog(tabId: number, log: CaptureLog) {
  const key = stashKey(tabId);
  const previous = ((await chrome.storage.session.get(key))[key] as CaptureLog | undefined) ?? { network: [], console: [] };
  await chrome.storage.session.set({
    [key]: {
      network: [...previous.network, ...log.network].slice(-300),
      console: [...previous.console, ...log.console].slice(-100),
    },
  });
}

/** The page's log from relay.ts plus whatever earlier pages in the same tab stashed. */
async function collectLog(tabId: number): Promise<{ log: CaptureLog; page: PageInfo | null; logAvailable: boolean }> {
  const key = stashKey(tabId);
  const stash = ((await chrome.storage.session.get(key))[key] as CaptureLog | undefined) ?? { network: [], console: [] };

  const live = await Promise.race([
    chrome.tabs.sendMessage(tabId, { type: "get-log" }).catch(() => null) as Promise<{ log: CaptureLog; page: PageInfo } | null>,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);

  if (!live) {
    // The page was open before the extension was installed or updated, so nothing was recorded.
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: pageInfo }).catch(() => []);
    return { log: stash, page: (result?.result as PageInfo | undefined) ?? null, logAvailable: stash.network.length > 0 };
  }

  const byTime = <T extends { startedAt?: number; at?: number }>(a: T, b: T) =>
    (a.startedAt ?? a.at ?? 0) - (b.startedAt ?? b.at ?? 0);
  return {
    log: {
      network: [...stash.network, ...live.log.network].sort(byTime).slice(-MAX_LOG_ENTRIES),
      console: [...stash.console, ...live.log.console].sort(byTime).slice(-MAX_LOG_ENTRIES),
    },
    page: live.page,
    logAvailable: true,
  };
}

async function openEditor(draftId: string, tab?: chrome.tabs.Tab) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`editor.html?draft=${encodeURIComponent(draftId)}`),
    index: tab?.index !== undefined ? tab.index + 1 : undefined,
    windowId: tab?.windowId,
  });
}
