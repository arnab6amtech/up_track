import { ApiError, ping, SignInRequired } from "./shared/api";
import { isRestricted } from "./shared/restricted";
import { getSettings, normalizeServerUrl, saveSettings, signInUrl, type Settings } from "./shared/settings";
import { recordedMs, type BackgroundMessage, type RecordingState } from "./shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const views = { setup: $("setup"), signin: $("signin"), actions: $("actions"), recording: $("recording") };

function show(view: keyof typeof views) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  $("open-settings").hidden = view !== "actions" && view !== "signin";
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
  // Ready: the page shows a Start button (it opens the controls' window, which only a click in the page can do).
  const ready = state.phase === "ready";
  $("rec-label").textContent = ready ? "Ready to record" : "Recording";
  $("timer").hidden = ready;
  $("stop").textContent = ready ? "Cancel" : "Stop and review";
  $("rec-help").textContent = ready
    ? "Click “Start recording” on the page. The controls open in a small window that isn't recorded."
    : "Reproduce the bug in the tab now. The API calls it makes are recorded too.";
  const tick = () => {
    const s = Math.floor(recordedMs(state) / 1000);
    $("timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 500);
}

function showSignIn(settings: Settings, reason?: string) {
  show("signin");
  $("signin-host").textContent = new URL(settings.serverUrl).host;
  $("signin-reason").textContent = reason ?? "";
  $("signin-reason").hidden = !reason || !settings.token;
  $("signin-open").onclick = () => {
    void chrome.tabs.create({ url: signInUrl(settings) });
    window.close();
  };
}

async function showActions(settings: Settings) {
  show("actions");
  const tab = await activeTab();
  const restricted = isRestricted(tab?.url);
  $<HTMLButtonElement>("screenshot").disabled = restricted;
  $<HTMLButtonElement>("record").disabled = restricted;
  $("restricted").hidden = !restricted;
  // Show who reports come from. Signed out: ask them to sign in before they capture anything.
  ping(settings).then(
    (who) => {
      const orgs = who.organizations.length === 1 ? ` to ${who.organizations[0]}` : "";
      $("connected").textContent = `Reporting as ${who.name}${orgs}.`;
      $("token-note").hidden = !who.tokenRejected;
    },
    (err) => {
      if (err instanceof SignInRequired) showSignIn(settings, err.message);
      else $("connected").textContent = `Can't reach ${new URL(settings.serverUrl).host} right now.`;
    },
  );
}

async function showSetup() {
  show("setup");
  const settings = await getSettings();
  $<HTMLInputElement>("server").value = settings?.serverUrl ?? "";
  $<HTMLInputElement>("token").value = settings?.token ?? "";
  $<HTMLInputElement>("server").focus();
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
  const settings: Settings = token ? { serverUrl, token } : { serverUrl };
  try {
    await ping(settings);
    await saveSettings(settings);
    await showActions(settings);
  } catch (err) {
    if (err instanceof SignInRequired && !token) {
      // The address works; they just aren't signed in yet.
      await saveSettings(settings);
      return showSignIn(settings);
    }
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
  const settings = await getSettings();
  if (settings) await showActions(settings);
  else await showSetup();
})();
