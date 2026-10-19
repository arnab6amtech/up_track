export interface Settings {
  serverUrl: string;
  /** Optional. Without one, the extension reports as whoever is signed in to UpTrack in this browser. */
  token?: string;
}

/** The server address UpTrack wrote into the zip it was downloaded from, if any. */
export async function bundledServerUrl(): Promise<string> {
  try {
    const config = (await (await fetch(chrome.runtime.getURL("config.json"))).json()) as { serverUrl?: string };
    return config.serverUrl ?? "";
  } catch {
    return "";
  }
}

/** Saved settings, else the address bundled with the download; null when there's no address at all. */
export async function getSettings(): Promise<Settings | null> {
  const { serverUrl, token } = await chrome.storage.local.get(["serverUrl", "token"]);
  const url = typeof serverUrl === "string" && serverUrl ? serverUrl : await bundledServerUrl();
  if (!url) return null;
  return typeof token === "string" && token ? { serverUrl: url, token } : { serverUrl: url };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ serverUrl: settings.serverUrl, token: settings.token ?? "" });
}

/** "uptrack.example.com/" → "https://uptrack.example.com"; localhost defaults to http. */
export function normalizeServerUrl(input: string): string | null {
  let text = input.trim().replace(/\/+$/, "");
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `${/^(localhost|127\.|\[::1\])/.test(text) ? "http" : "https"}://${text}`;
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** UpTrack's sign-in page. */
export const signInUrl = (settings: Settings) => `${settings.serverUrl}/login`;
