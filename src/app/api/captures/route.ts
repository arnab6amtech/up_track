import { revalidateTag } from "next/cache";
import { z } from "zod";
import { CAPTURES_WORKBOOK_ID } from "@/lib/capture-types";
import { createCapture } from "@/lib/captures";
import { workbookTag } from "@/lib/data";
import { authenticate, mcpEnabled } from "@/lib/mcp/auth";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_LOG_BYTES = 15 * 1024 * 1024;

/** Accepted media, recognised by their first bytes rather than the name or type the client claims. */
const MEDIA_TYPES: { mime: string; ext: string; kind: "image" | "video"; magic: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", ext: ".png", kind: "image", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: ".jpg", kind: "image", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: "video/webm", ext: ".webm", kind: "video", magic: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: "video/mp4", ext: ".mp4", kind: "video", magic: (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp" },
];

const str = (max: number) => z.string().max(max);
const headers = z.record(str(200), str(4000)).optional();
const ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);

const metaSchema = z.object({
  title: z.string().trim().min(1, "Give the bug a title.").max(200),
  description: str(20_000).optional(),
  severity: str(40).optional(),
  priority: str(40).optional(),
  module: str(120).optional(),
  page: z.object({
    url: str(8000),
    title: str(2000),
    userAgent: str(1000),
    viewport: z.object({ width: z.number(), height: z.number() }),
    screen: z.object({ width: z.number(), height: z.number() }).optional(),
    devicePixelRatio: z.number(),
    language: str(50),
    timezone: str(100),
  }),
  media: z.object({
    kind: z.enum(["image", "video"]),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: ms.optional(),
    trimStartMs: ms.optional(),
    trimEndMs: ms.optional(),
  }),
});

const logSchema = z.object({
  network: z
    .array(
      z.object({
        type: z.enum(["fetch", "xhr"]),
        method: str(20),
        url: str(8000),
        status: z.number().int().min(0).max(999),
        statusText: str(200).optional(),
        startedAt: z.number(),
        durationMs: z.number().min(0),
        requestHeaders: headers,
        responseHeaders: headers,
        requestBody: str(200_000).optional(),
        responseBody: str(200_000).optional(),
        error: str(2000).optional(),
      }),
    )
    .max(2000),
  console: z
    .array(
      z.object({
        level: z.enum(["error", "warn"]),
        message: str(20_000),
        at: z.number(),
        stack: str(20_000).optional(),
        source: z.enum(["console", "exception", "rejection"]),
      }),
    )
    .max(2000),
});

const error = (status: number, message: string) => Response.json({ error: message }, { status });

function check(request: Request) {
  if (!mcpEnabled()) return { error: error(503, "Uploads are turned off on this server. Ask an admin to set MCP_TOKENS.") };
  const caller = authenticate(request);
  if (!caller) return { error: error(401, "Your UpTrack token is missing or wrong. Check it in the extension's settings.") };
  return { caller };
}

/** Lets the extension check its server address and token. */
export async function GET(request: Request) {
  const auth = check(request);
  if ("error" in auth) return auth.error;
  return Response.json({ ok: true, name: auth.caller.name });
}

/** Receives a capture from the browser extension: `meta` (JSON), `media` (file) and `log` (JSON file). */
export async function POST(request: Request) {
  const auth = check(request);
  if ("error" in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "Expected a multipart form upload.");
  }

  let meta: z.infer<typeof metaSchema>;
  let log: z.infer<typeof logSchema>;
  try {
    const metaPart = form.get("meta");
    const metaText = metaPart instanceof File ? await metaPart.slice(0, 100_000).text() : String(metaPart ?? "");
    const parsedMeta = metaSchema.safeParse(JSON.parse(metaText));
    if (!parsedMeta.success) return error(400, parsedMeta.error.issues[0]?.message ?? "Invalid capture details.");
    meta = parsedMeta.data;

    const logPart = form.get("log");
    const logText = logPart instanceof File ? (logPart.size > MAX_LOG_BYTES ? null : await logPart.text()) : String(logPart ?? "");
    if (logText === null) return error(413, "The API log is too large.");
    const parsedLog = logSchema.safeParse(logText ? JSON.parse(logText) : { network: [], console: [] });
    if (!parsedLog.success) return error(400, "The API log isn't in the expected format.");
    log = parsedLog.data;
  } catch {
    return error(400, "Capture details aren't valid JSON.");
  }

  const media = form.get("media");
  if (!(media instanceof File) || media.size === 0) return error(400, "The screenshot or recording is missing.");
  const limit = meta.media.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (media.size > limit) return error(413, `That ${meta.media.kind === "image" ? "screenshot" : "recording"} is too large.`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const type = MEDIA_TYPES.find((t) => t.kind === meta.media.kind && t.magic(bytes));
  if (!type) return error(415, meta.media.kind === "image" ? "Screenshots must be PNG or JPEG." : "Recordings must be WebM or MP4.");

  const capture = await createCapture({
    meta,
    reporter: auth.caller.name,
    media: { bytes, mime: type.mime, ext: type.ext },
    log,
  });
  revalidateTag(workbookTag(CAPTURES_WORKBOOK_ID), { expire: 0 });
  console.info(`[captures] ${auth.caller.name} reported #${capture.number} "${capture.title}"`);

  const base = process.env.PUBLIC_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
  return Response.json(
    {
      id: capture.id,
      number: capture.number,
      shareUrl: `${base}/c/${capture.id}`,
      bugUrl: `${base}/bug/reported-${capture.number}?wb=${CAPTURES_WORKBOOK_ID}`,
    },
    { status: 201 },
  );
}
