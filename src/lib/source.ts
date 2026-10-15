import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { uploadPath, type WorkbookSource } from "./workbooks";

export interface WorkbookFile {
  bytes: Uint8Array;
  title: string;
  modifiedTime: string | null;
  source: string;
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function serviceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  // Accept the key file's JSON as-is or base64-encoded (easier to paste into hosting dashboards).
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

async function driveAuth(): Promise<{ headers: Record<string, string>; query: string }> {
  const credentials = serviceAccountCredentials();
  if (credentials) {
    const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    const token = await auth.getAccessToken();
    return { headers: { Authorization: `Bearer ${token}` }, query: "" };
  }
  const key = process.env.GOOGLE_API_KEY?.trim();
  if (key) return { headers: {}, query: `&key=${encodeURIComponent(key)}` };
  throw new Error(
    "No Google credentials are configured, so Drive links can't be read. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_API_KEY (see .env.example), or upload the .xlsx file instead.",
  );
}

async function driveJson(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Drive request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

async function fromDrive(fileId: string): Promise<WorkbookFile> {
  const { headers, query } = await driveAuth();
  const id = encodeURIComponent(fileId);

  const metaRes = await driveJson(
    `${DRIVE}/${id}?fields=name,mimeType,modifiedTime&supportsAllDrives=true${query}`,
    { headers },
  );
  const meta = (await metaRes.json()) as { name: string; mimeType: string; modifiedTime?: string };

  // An uploaded .xlsx is downloaded as-is; a native Google Sheet has to be exported.
  const contentUrl =
    meta.mimeType === SHEETS_MIME
      ? `${DRIVE}/${id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}${query}`
      : `${DRIVE}/${id}?alt=media&supportsAllDrives=true${query}`;
  const fileRes = await driveJson(contentUrl, { headers });

  return {
    bytes: new Uint8Array(await fileRes.arrayBuffer()),
    title: meta.name,
    modifiedTime: meta.modifiedTime ?? null,
    source: "Google Drive",
  };
}

/**
 * Downloads a Drive image with the app's credentials, for files that aren't shared publicly.
 * Returns null when no credentials are set, the file isn't an image, or it's larger than `maxBytes`.
 */
export async function downloadDriveImage(
  fileId: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() && !process.env.GOOGLE_API_KEY?.trim()) return null;
  const { headers, query } = await driveAuth();
  const id = encodeURIComponent(fileId);
  const meta = (await (
    await driveJson(`${DRIVE}/${id}?fields=mimeType,size&supportsAllDrives=true${query}`, { headers })
  ).json()) as { mimeType: string; size?: string };
  if (!meta.mimeType.startsWith("image/") || Number(meta.size ?? 0) > maxBytes) return null;
  const res = await driveJson(`${DRIVE}/${id}?alt=media&supportsAllDrives=true${query}`, { headers });
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: meta.mimeType };
}

async function fromDisk(filePath: string, title: string, source: string): Promise<WorkbookFile> {
  const [bytes, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  return {
    bytes: new Uint8Array(bytes),
    title,
    modifiedTime: info.mtime.toISOString(),
    source,
  };
}

export async function loadWorkbookFile(source: WorkbookSource): Promise<WorkbookFile> {
  switch (source.type) {
    case "drive":
      return fromDrive(source.fileId);
    case "upload":
      return fromDisk(uploadPath(source.file), source.originalName, "Uploaded file");
    case "local": {
      // Dev-only escape hatch; keep the bundler from tracing the whole project because of it.
      const abs = path.resolve(/*turbopackIgnore: true*/ process.cwd(), source.path);
      return fromDisk(abs, path.basename(abs), `Local file (${source.path})`);
    }
  }
}
