import { canViewProject } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { getAttachment, isValidShareForBug } from "@/server/bugs";
import { getObject } from "@/server/storage";

/**
 * Serves a bug's screenshot, recording or log to people who can see the bug: signed-in members of
 * its project, or anyone holding a valid share link for it (?share=…). Supports Range requests so
 * recordings can seek.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const { id } = await ctx.params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();
  const attachment = await getAttachment(id);
  if (!attachment) return notFound();

  const share = new URL(request.url).searchParams.get("share");
  let allowed = false;
  if (share) allowed = await isValidShareForBug(share, attachment.bugId);
  else {
    const user = await getCurrentUser();
    allowed = !!user && (await canViewProject(user.id, attachment.organizationId, attachment.projectId));
  }
  // Same answer whether it doesn't exist or isn't yours, so ids can't be probed.
  if (!allowed) return notFound();

  const headers: Record<string, string> = {
    "Content-Type": attachment.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${attachment.fileName.replace(/[^\w.-]+/g, "_")}"`,
  };
  const size = attachment.sizeBytes;
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const object = await getObject(attachment.storageKey, { start, end });
    if (!object) return notFound();
    return new Response(object.stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const object = await getObject(attachment.storageKey);
  if (!object) return notFound();
  return new Response(object.stream, { headers: { ...headers, "Content-Length": String(object.size) } });
}
