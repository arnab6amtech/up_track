/** Where UpTrack is, and the extension's sign-in. */
export interface Settings {
  serverUrl: string;
  /** The session token from signing in to the extension; missing while signed out. */
  token?: string;
}

/** Who the extension is signed in as, kept in the extension's own storage. */
export interface Auth {
  token: string;
  name: string;
  email: string;
}

const AUTH_KEY = "auth";

let bundled: Promise<string> | null = null;

/**
 * UpTrack's address, built into the extension: the server writes it into the zip it serves, and a local
 * build writes UPTRACK_URL (default http://localhost:3000). Nobody types it in.
 */
export function serverUrl(): Promise<string> {
  bundled ??= fetch(chrome.runtime.getURL("config.json"))
    .then((r) => r.json() as Promise<{ serverUrl?: string }>)
    .then((c) => (c.serverUrl ?? "").replace(/\/+$/, ""))
    .catch(() => "");
  return bundled;
}

export async function getAuth(): Promise<Auth | null> {
  const auth = (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] as Partial<Auth> | undefined;
  return typeof auth?.token === "string" ? (auth as Auth) : null;
}

export async function saveAuth(auth: Auth): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

/** Calls back when the extension signs in or out (in the menu, or because the session expired). */
export function onAuthChange(callback: () => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && AUTH_KEY in changes) callback();
  });
}

/** The address and current sign-in; null only if the build has no address in it. */
export async function getSettings(): Promise<Settings | null> {
  const url = await serverUrl();
  if (!url) return null;
  const auth = await getAuth();
  return auth ? { serverUrl: url, token: auth.token } : { serverUrl: url };
}

/** Earlier versions kept a typed-in address and an API token; sign-in replaces both. */
export async function forgetOldSettings(): Promise<void> {
  await chrome.storage.local.remove(["serverUrl", "token"]);
}

/** UpTrack's sign-up page, for people without an account yet. */
export const signUpUrl = (settings: Settings) => `${settings.serverUrl}/signup`;
