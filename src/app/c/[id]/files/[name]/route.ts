import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { captureFilePath } from "@/lib/captures";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

/** Serves a capture's screenshot, recording or log. Supports Range requests so videos can seek. */
export async function GET(request: Request, ctx: RouteContext<"/c/[id]/files/[name]">) {
  const { id, name } = await ctx.params;
  const file = captureFilePath(id, name);
  const type = TYPES[path.extname(name)];
  const info = file && type ? await stat(file).catch(() => null) : null;
  if (!file || !type || !info?.isFile()) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // Files never change once uploaded; the capture ID in the URL is what keeps them private.
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const size = info.size;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(info.size) } });
}
