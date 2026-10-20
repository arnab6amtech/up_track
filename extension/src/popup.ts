import { ApiError, ping, signIn, SignInRequired, signOut, type Who } from "./shared/api";
import { isRestricted } from "./shared/restricted";
import { forgetOldSettings, getSettings, serverUrl, signUpUrl, type Settings } from "./shared/settings";
import { recordedMs, type BackgroundMessage, type RecordingState } from "./shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const views = { signin: $("signin"), actions: $("actions"), recording: $("recording") };

function show(view: keyof typeof views) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  $("open-home").hidden = view !== "actions";
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
    const s = Math.floor(recordedMs(state) / 1000);
    $("timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 500);
}

/** Asks for an email and password; a reason says why (e.g. the sign-in expired). */
function showSignIn(settings: Settings, reason?: string) {
  show("signin");
  showError("signin-error", reason ?? null);
  $("signup-open").onclick = (e) => {
    e.preventDefault();
    void chrome.tabs.create({ url: signUpUrl(settings) });
    window.close();
  };
  $<HTMLInputElement>("email").focus();
}

/** "Reporting to Null Void Studio", "to your personal workspace", or several organizations. */
function describeWhere(who: Who): string {
  const orgs = who.workspaces.filter((w) => w.kind === "organization").map((w) => w.name);
  if (who.account === "personal") return "Personal account · your workspace";
  return `Organization account · ${orgs.length === 1 ? orgs[0] : `${orgs.length} organizations`}`;
}

async function showActions(settings: Settings) {
  show("actions");
  const tab = await activeTab();
  const restricted = isRestricted(tab?.url);
  $<HTMLButtonElement>("screenshot").disabled = restricted;
  $<HTMLButtonElement>("record").disabled = restricted;
  $("restricted").hidden = !restricted;
  $("account-name").textContent = "Checking your account…";
  $("account-where").textContent = "";
  // Who reports come from, and where they go. A sign-in that stopped working asks for a new one.
  ping(settings).then(
    (who) => {
      $("account-name").textContent = `${who.name} (${who.email})`;
      $("account-where").textContent = describeWhere(who);
    },
    (err) => {
      if (err instanceof SignInRequired) showSignIn({ serverUrl: settings.serverUrl }, err.message);
      else $("account-name").textContent = err instanceof ApiError ? err.message : "Can't reach UpTrack right now.";
    },
  );
}

$("signin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("signin-error", null);
  const url = await serverUrl();
  const button = $<HTMLButtonElement>("signin-submit");
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const auth = await signIn(url, $<HTMLInputElement>("email").value.trim(), $<HTMLInputElement>("password").value);
    $<HTMLInputElement>("password").value = "";
    await showActions({ serverUrl: url, token: auth.token });
  } catch (err) {
    showError("signin-error", err instanceof ApiError ? err.message : "Something went wrong. Try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("signout").addEventListener("click", async () => {
  const settings = await getSettings();
  if (!settings) return;
  await signOut(settings);
  // Usually to switch accounts, so start empty.
  $<HTMLInputElement>("email").value = "";
  $<HTMLInputElement>("password").value = "";
  showSignIn({ serverUrl: settings.serverUrl });
});

// Home: the bug list of the project last reported to, else UpTrack's start page (it picks the organization).
$("open-home").addEventListener("click", async () => {
  const settings = await getSettings();
  if (!settings) return;
  const last = (await chrome.storage.local.get("lastReportTarget")).lastReportTarget as { listPath?: string } | undefined;
  await chrome.tabs.create({ url: `${settings.serverUrl}${last?.listPath ?? "/"}` });
  window.close();
});

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
  await forgetOldSettings();
  const settings = await getSettings();
  if (!settings) {
    show("signin");
    return showError("signin-error", "This copy of the extension doesn't know where UpTrack is. Download it again from UpTrack's Extension page.");
  }
  if (settings.token) await showActions(settings);
  else showSignIn(settings);
})();
