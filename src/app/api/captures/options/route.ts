import { z } from "zod";
import { UserError } from "@/server/orgs";
import { createComponent, createPlatform } from "@/server/projects";
import { listReportableProjects } from "@/server/reportable";
import { authenticateReporter } from "@/server/reporter";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["platform", "feature"]),
  name: z.string().trim().min(1, "Give it a name.").max(100, "Keep the name under 100 characters."),
});

/**
 * Adds a platform or feature to a project from the extension's report editor, for anyone who may report
 * bugs to it. A name the project already has (in any capitalisation) returns that one instead.
 */
export async function POST(request: Request) {
  const auth = await authenticateReporter(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { reporter } = auth;

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Give it a name." }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: "Send the project, kind and name as JSON." }, { status: 400 });
  }

  for (const org of reporter.orgs) {
    const project = (await listReportableProjects(org, reporter.userId, org.isAdmin)).find((p) => p.id === body.projectId);
    if (!project) continue;
    const list = body.kind === "platform" ? project.platforms : project.components;
    const existing = list.find((x) => x.name.toLowerCase() === body.name.toLowerCase());
    if (existing) return Response.json({ id: existing.id, name: existing.name, existed: true });
    try {
      const id = body.kind === "platform" ? await createPlatform(org.id, project.id, body.name) : await createComponent(org.id, project.id, body.name);
      return Response.json({ id, name: body.name }, { status: 201 });
    } catch (err) {
      if (err instanceof UserError) return Response.json({ error: err.message }, { status: 409 });
      throw err;
    }
  }
  return Response.json({ error: "You can't report bugs to that project." }, { status: 403 });
}
