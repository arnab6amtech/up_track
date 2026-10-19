import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * File storage for attachments. This implementation writes to a local folder (STORAGE_DIR, default
 * data/storage); an S3/R2 implementation only needs these three functions.
 */
function root(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR?.trim() || "data/storage");
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,300}$/i;

function resolveKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
  return path.join(root(), key);
}

export async function putObject(key: string, bytes: Uint8Array): Promise<void> {
  const file = resolveKey(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function deleteObject(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}

/** A stream of the object (or a byte range of it) and its total size; null if it's missing. */
export async function getObject(
  key: string,
  range?: { start: number; end: number },
): Promise<{ stream: ReadableStream; size: number } | null> {
  const file = resolveKey(key);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  return { stream: Readable.toWeb(createReadStream(file, range)) as ReadableStream, size: info.size };
}

export async function objectSize(key: string): Promise<number | null> {
  const info = await stat(resolveKey(key)).catch(() => null);
  return info?.isFile() ? info.size : null;
}
