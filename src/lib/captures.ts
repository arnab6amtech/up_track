import "server-only";
import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTURES_TAB_SLUG,
  CAPTURES_WORKBOOK_NAME,
  isFailed,
  type Capture,
  type CaptureLog,
  type CaptureMedia,
  type CaptureUploadMeta,
} from "./capture-types";
import type { BugRecord, MediaLink } from "./types";
import { workbooksDir } from "./workbooks";

const ID_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_RE = /^[A-Za-z0-9]{16}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,60}$/;

const capturesDir = () => path.join(workbooksDir(), "captures");
const indexPath = () => path.join(capturesDir(), "index.json");

function newId(): string {
  return Array.from({ length: 16 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join("");
}

export function isCaptureId(id: string): boolean {
  return ID_RE.test(id);
}

/** Absolute path of a capture's file, or null if either name could escape the captures folder. */
export function captureFilePath(id: string, file: string): string | null {
  if (!ID_RE.test(id) || !FILE_RE.test(file)) return null;
  return path.join(capturesDir(), id, file);
}

export async function listCaptures(): Promise<Capture[]> {
  try {
    return JSON.parse(await readFile(indexPath(), "utf8")) as Capture[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function getCapture(id: string): Promise<Capture | null> {
  if (!ID_RE.test(id)) return null;
  return (await listCaptures()).find((c) => c.id === id) ?? null;
}

export async function readCaptureLog(id: string): Promise<CaptureLog> {
  const file = captureFilePath(id, "log.json");
  if (!file) return { network: [], console: [] };
  try {
    return JSON.parse(await readFile(file, "utf8")) as CaptureLog;
  } catch {
    return { network: [], console: [] };
  }
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export async function createCapture(input: {
  meta: CaptureUploadMeta;
  reporter: string;
  media: { bytes: Uint8Array; mime: string; ext: string };
  log: CaptureLog;
}): Promise<Capture> {
  const id = newId();
  const dir = path.join(capturesDir(), id);
  await mkdir(dir, { recursive: true });

  const mediaFile = `${input.meta.media.kind === "image" ? "screenshot" : "recording"}${input.media.ext}`;
  try {
    await writeFile(path.join(dir, mediaFile), input.media.bytes);
    await writeFile(path.join(dir, "log.json"), JSON.stringify(input.log));

    const all = await listCaptures();
    const { meta } = input;
    const media: CaptureMedia = { ...meta.media, file: mediaFile, mime: input.media.mime };
    const capture: Capture = {
      id,
      number: all.reduce((max, c) => Math.max(max, c.number), 0) + 1,
      createdAt: new Date().toISOString(),
      reporter: input.reporter,
      title: meta.title.trim(),
      description: meta.description?.trim() ?? "",
      severity: meta.severity ?? "",
      priority: meta.priority ?? "",
      module: meta.module?.trim() ?? "",
      status: "Open",
      media: [media],
      page: meta.page,
      counts: {
        requests: input.log.network.length,
        failedRequests: input.log.network.filter(isFailed).length,
        consoleErrors: input.log.console.filter((c) => c.level === "error").length,
      },
    };
    await writeJson(indexPath(), [...all, capture]);
    return capture;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

/** Public path of a capture's file; the unguessable capture ID is what keeps it private. */
export const captureFileUrl = (id: string, file: string) => `/c/${id}/files/${file}`;

function mediaLink(c: Capture, m: CaptureMedia): MediaLink {
  const url = captureFileUrl(c.id, m.file);
  if (m.kind === "image") return { url, kind: "image", src: url, label: `Screenshot of ${c.page.url}` };
  // A media fragment starts and stops playback at the trimmed part.
  const trim =
    m.trimStartMs !== undefined || m.trimEndMs !== undefined
      ? `#t=${(m.trimStartMs ?? 0) / 1000}${m.trimEndMs !== undefined ? `,${m.trimEndMs / 1000}` : ""}`
      : "";
  return { url, kind: "video", src: `${url}${trim}`, label: `Recording of ${c.page.url}` };
}

export function captureToRecord(c: Capture): BugRecord {
  return {
    id: `${CAPTURES_TAB_SLUG}-${c.number}`,
    kind: "issue",
    tab: CAPTURES_WORKBOOK_NAME,
    tabSlug: CAPTURES_TAB_SLUG,
    row: c.number,
    module: c.module,
    feature: "",
    title: c.title,
    status: c.status,
    devStatus: "",
    severity: c.severity,
    priority: c.priority,
    devRemarks: "",
    qaRemarks: "",
    developer: "",
    taskId: "",
    bugId: "",
    sl: "",
    testCaseId: "",
    testData: "",
    steps: "",
    expected: "",
    actual: "",
    devCheck: "",
    description: c.description,
    media: c.media.map((m) => mediaLink(c, m)),
    capture: {
      id: c.id,
      reporter: c.reporter,
      createdAt: c.createdAt,
      pageUrl: c.page.url,
      counts: c.counts,
    },
  };
}
