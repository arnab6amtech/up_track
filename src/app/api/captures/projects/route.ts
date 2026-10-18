import { listReportableProjects } from "@/server/reportable";
import { authenticateReporter } from "@/server/reporter";

/** Projects, versions and modules the caller can report to, for the extension's pickers. */
export async function GET(request: Request) {
  const auth = await authenticateReporter(request);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const { reporter } = auth;
  const lists = await Promise.all(reporter.orgs.map((org) => listReportableProjects(org, reporter.userId, org.isAdmin)));
  return Response.json({ projects: lists.flat() });
}
