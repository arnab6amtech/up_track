import type { MediaLink } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
const URL_RE = /https?:\/\/[^\s"'<>]+/g;

/** Pull every http(s) URL out of free text, trimming trailing punctuation. */
export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[),.;\]]+$/, ""));
}

function driveId(u: URL): string | null {
  if (!/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) return null;
  const m = u.pathname.match(/\/(?:file\/)?d\/([\w-]{10,})/);
  if (m) return m[1];
  return u.searchParams.get("id");
}

export function classifyLink(raw: string, label?: string): MediaLink {
  const url = raw.trim();
  const base = { url, label: label && label.trim() !== url ? label.trim() : undefined };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ...base, kind: "link", src: url };
  }

  const id = driveId(u);
  if (id) {
    // The /preview embed plays videos; the thumbnail endpoint gives a plain image that loads faster
    // and isn't blocked by third-party-cookie settings. Both need the file to be visible to the viewer.
    return {
      ...base,
      kind: "drive",
      src: `https://drive.google.com/file/d/${id}/preview`,
      thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
      video: VIDEO_EXT.test(label ?? ""),
      fileId: id,
    };
  }

  const path = decodeURIComponent(u.pathname);

  if (/(^|\.)dropbox(usercontent)?\.com$/.test(u.hostname)) {
    // www.dropbox.com share links render an HTML page; raw=1 makes them return the file itself.
    const direct = new URL(url);
    if (direct.hostname.endsWith("dropbox.com")) {
      direct.searchParams.delete("dl");
      direct.searchParams.set("raw", "1");
    }
    const kind = VIDEO_EXT.test(path) ? "video" : IMAGE_EXT.test(path) ? "image" : "probe";
    return { ...base, kind, src: direct.toString() };
  }

  if (VIDEO_EXT.test(path)) return { ...base, kind: "video", src: url };
  if (IMAGE_EXT.test(path)) return { ...base, kind: "image", src: url };

  // Mattermost public file links carry no extension; let the browser figure out what they are.
  if (/\/files\/[\w-]+\/public/.test(path)) return { ...base, kind: "probe", src: url };

  return { ...base, kind: "link", src: url };
}

/** Small preview image for a list tile, or null when the link has no cheap still image. */
export function tileThumb(m: MediaLink): string | null {
  if (m.kind === "drive" && m.thumb) return m.thumb.replace(/sz=w\d+/, "sz=w120");
  if (m.kind === "image") return m.src;
  return null;
}
