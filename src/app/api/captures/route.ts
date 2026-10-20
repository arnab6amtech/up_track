import { z } from "zod";
import { NETWORK_TYPES, PRIORITIES, SEVERITIES, type ReportableProject } from "@/lib/capture-types";
import { publicOrigin } from "@/lib/origin";
import { createBug, createShareLink } from "@/server/bugs";
import { listReportableProjects } from "@/server/reportable";
import { authenticateReporter } from "@/server/reporter";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_LOG_BYTES = 15 * 1024 * 1024;

/** Accepted media, recognised by their first bytes rather than the name or type the client claims. */
const MEDIA_TYPES: { mime: string; kind: "image" | "video"; magic: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", kind: "image", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", kind: "image", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: "video/webm", kind: "video", magic: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: "video/mp4", kind: "video", magic: (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp" },
];

const str = (max: number) => z.string().max(max);
const headers = z.record(str(200), str(4000)).optional();
const ms = z.number().int().min(0).max(24 * 60 * 60 * 1000);

const metaSchema = z.object({
  projectId: z.string().uuid("Pick a project."),
  versionId: z.string().uuid("Pick the version you found it in."),
  platformId: z.string().uuid().optional().or(z.literal("")),
  componentId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1, "Give the bug a title.").max(300),
  description: str(20_000).optional(),
  severity: z.enum(SEVERITIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
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
    markers: z.array(z.object({ atMs: ms, label: str(200).optional() })).max(50).optional(),
    trimEndMs: ms.optional(),
  }),
});

const logSchema = z.object({
  network: z
    .array(
      z.object({
        type: z.enum(NETWORK_TYPES),
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
        sizeBytes: z.number().int().min(0).optional(),
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

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

/** Lets the extension check its server address and who it will report as. */
export async function GET(request: Request) {
  const auth = await authenticateReporter(request);
  if ("error" in auth) return fail(auth.status, auth.error);
  const { reporter } = auth;
  return Response.json({
    ok: true,
    name: reporter.userName,
    organizations: reporter.orgs.map((o) => o.name),
    via: reporter.via,
    tokenRejected: reporter.tokenRejected,
  });
}

async function partText(part: FormDataEntryValue | null, max: number): Promise<string | null> {
  if (part instanceof File) return part.size > max ? null : part.text();
  return part === null ? "" : String(part);
}

/** Creates a bug from the browser extension: `meta` (JSON), `media` (file) and `log` (JSON). */
export async function POST(request: Request) {
  const auth = await authenticateReporter(request);
  if ("error" in auth) return fail(auth.status, auth.error);
  const { reporter } = auth;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }

  let meta: z.infer<typeof metaSchema>;
  let log: z.infer<typeof logSchema>;
  try {
    const metaText = await partText(form.get("meta"), 100_000);
    const parsedMeta = metaSchema.safeParse(JSON.parse(metaText ?? ""));
    if (!parsedMeta.success) return fail(400, parsedMeta.error.issues[0]?.message ?? "Invalid bug details.");
    meta = parsedMeta.data;
    const logText = await partText(form.get("log"), MAX_LOG_BYTES);
    if (logText === null) return fail(413, "The API log is too large.");
    const parsedLog = logSchema.safeParse(logText ? JSON.parse(logText) : { network: [], console: [] });
    if (!parsedLog.success) return fail(400, "The API log isn't in the expected format.");
    log = parsedLog.data;
  } catch {
    return fail(400, "Bug details aren't valid JSON.");
  }

  // The project must be one this person may report to, and the version, platform and feature must belong to it.
  let found: { org: (typeof reporter.orgs)[number]; project: ReportableProject } | undefined;
  for (const org of reporter.orgs) {
    const project = (await listReportableProjects(org, reporter.userId, org.isAdmin)).find((p) => p.id === meta.projectId);
    if (project) {
      found = { org, project };
      break;
    }
  }
  if (!found) return fail(403, "You can't report bugs to that project.");
  const { org, project } = found;
  if (!project.versions.some((v) => v.id === meta.versionId)) return fail(400, "That version isn't an active version of the project.");
  if (project.components.length === 0) {
    return fail(400, `${project.name} has no features yet. Ask a project manager to add them in the project's settings.`);
  }
  if (project.platforms.length > 0 && !meta.platformId) return fail(400, "Pick the platform you found it on.");
  if (meta.platformId && !project.platforms.some((p) => p.id === meta.platformId)) return fail(400, "That platform isn't part of the project.");
  if (!meta.componentId) return fail(400, "Pick the feature this bug is in.");
  if (!project.components.some((c) => c.id === meta.componentId)) return fail(400, "That feature isn't part of the project.");

  const media = form.get("media");
  if (!(media instanceof File) || media.size === 0) return fail(400, "The screenshot or recording is missing.");
  if (media.size > (meta.media.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
    return fail(413, `That ${meta.media.kind === "image" ? "screenshot" : "recording"} is too large.`);
  }
  const bytes = new Uint8Array(await media.arrayBuffer());
  const type = MEDIA_TYPES.find((t) => t.kind === meta.media.kind && t.magic(bytes));
  if (!type) return fail(415, meta.media.kind === "image" ? "Screenshots must be PNG or JPEG." : "Recordings must be WebM or MP4.");

  const bug = await createBug(org.id, {
    projectId: project.id,
    reporterId: reporter.userId,
    title: meta.title,
    description: meta.description,
    foundInVersionId: meta.versionId,
    componentId: meta.componentId || null,
    platformId: meta.platformId || null,
    severity: meta.severity,
    priority: meta.priority,
    source: "browser_extension",
    attachments: [
      {
        kind: type.kind,
        fileName: type.kind === "image" ? "screenshot.png" : "recording.webm",
        contentType: type.mime,
        bytes,
        width: meta.media.width,
        height: meta.media.height,
        durationMs: meta.media.durationMs,
        trimStartMs: meta.media.trimStartMs,
        trimEndMs: meta.media.trimEndMs,
        markers: meta.media.kind === "video" && meta.media.markers?.length ? meta.media.markers : undefined,
      },
    ],
    capture: { page: meta.page, log },
  });
  const key = `${project.key}-${bug.number}`;
  // Reports from the extension come with a share link, like before; it can be revoked on the bug page.
  const shareToken = await createShareLink(org.id, bug.id, reporter.userId, null);
  console.info(`[captures] ${reporter.userName} reported ${key} "${meta.title}"`);
  const base = await publicOrigin();
  return Response.json(
    {
      key,
      number: bug.number,
      bugUrl: `${base}/o/${org.slug}/p/${project.key}/bugs/${bug.number}`,
      shareUrl: `${base}/s/${shareToken}`,
      fixCommand: `/uptrack:fix-bug ${key}`,
    },
    { status: 201 },
  );
}
