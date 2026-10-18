import { ApiError, ping } from "./shared/api";
import { isRestricted } from "./shared/restricted";
import { getSettings, normalizeServerUrl, saveSettings } from "./shared/settings";
import type { BackgroundMessage, RecordingState } from "./shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const views = { setup: $("setup"), actions: $("actions"), recording: $("recording") };

function show(view: keyof typeof views) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  $("open-settings").hidden = view !== "actions";
}

function showError(id: string, message: string | null) {
  const el = $<HTMLParagraphElement>(id);
  el.textContent = message ?? "";
  el.hidden = !message;
}

async function send<T = object>(message: BackgroundMessage): Promise<T & { ok: boolean; error?: string }> {
  return chrome.runtime.sendMessage(message);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

let timer: ReturnType<typeof setInterval> | undefined;

function showRecording(state: RecordingState) {
  show("recording");
  const tick = () => {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    $("timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 500);
}

async function showActions() {
  show("actions");
  const settings = await getSettings();
  const tab = await activeTab();
  const restricted = isRestricted(tab?.url);
  $<HTMLButtonElement>("screenshot").disabled = restricted;
  $<HTMLButtonElement>("record").disabled = restricted;
  $("restricted").hidden = !restricted;
  if (settings) {
    // Show who the token belongs to; a failure here is shown when they actually capture.
    ping(settings).then(
      (name) => ($("connected").textContent = `Reporting as ${name} to ${new URL(settings.serverUrl).host}.`),
      () => ($("connected").textContent = `Can't reach ${new URL(settings.serverUrl).host} right now.`),
    );
  }
}

/** The server address UpTrack wrote into the zip it was downloaded from, if any. */
async function bundledServerUrl(): Promise<string> {
  try {
    const config = (await (await fetch(chrome.runtime.getURL("config.json"))).json()) as { serverUrl?: string };
    return config.serverUrl ?? "";
  } catch {
    return "";
  }
}

async function showSetup() {
  show("setup");
  const settings = await getSettings();
  $<HTMLInputElement>("server").value = settings?.serverUrl ?? (await bundledServerUrl());
  $<HTMLInputElement>("token").value = settings?.token ?? "";
  $<HTMLInputElement>(settings || $<HTMLInputElement>("server").value ? "token" : "server").focus();
}

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("settings-error", null);
  const serverUrl = normalizeServerUrl($<HTMLInputElement>("server").value);
  const token = $<HTMLInputElement>("token").value.trim();
  if (!serverUrl) return showError("settings-error", "That address doesn't look right.");
  const button = $<HTMLButtonElement>("settings-save");
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    await ping({ serverUrl, token });
    await saveSettings({ serverUrl, token });
    await showActions();
  } catch (err) {
    showError("settings-error", err instanceof ApiError ? err.message : "Something went wrong. Try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Save and connect";
  }
});

$("open-settings").addEventListener("click", () => void showSetup());

$("screenshot").addEventListener("click", async () => {
  showError("action-error", null);
  const tab = await activeTab();
  if (tab?.id === undefined) return;
  const result = await send({ type: "screenshot", tabId: tab.id, windowId: tab.windowId });
  if (result.ok) window.close();
  else showError("action-error", result.error ?? "The screenshot failed.");
});

$("record").addEventListener("click", async () => {
  showError("action-error", null);
  const tab = await activeTab();
  if (tab?.id === undefined) return;
  const result = await send<{ recording: RecordingState }>({ type: "record-start", tabId: tab.id });
  if (result.ok) window.close();
  else showError("action-error", result.error ?? "The recording couldn't start.");
});

$("stop").addEventListener("click", async () => {
  $<HTMLButtonElement>("stop").disabled = true;
  await send({ type: "record-stop" });
  window.close();
});

(async () => {
  const state = await send<{ recording: RecordingState | null }>({ type: "state" });
  if (state.recording) return showRecording(state.recording);
  if (await getSettings()) await showActions();
  else await showSetup();
})();
