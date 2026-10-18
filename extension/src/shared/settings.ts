export interface Settings {
  serverUrl: string;
  token: string;
}

export async function getSettings(): Promise<Settings | null> {
  const { serverUrl, token } = await chrome.storage.local.get(["serverUrl", "token"]);
  return typeof serverUrl === "string" && typeof token === "string" && serverUrl && token ? { serverUrl, token } : null;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set(settings);
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
