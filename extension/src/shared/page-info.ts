import type { PageInfo } from "./types";

/**
 * Details of the page a bug was captured on. Self-contained (uses only browser globals) so the
 * background worker can also run it in a tab with chrome.scripting.executeScript.
 */
export function pageInfo(): PageInfo {
  return {
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
