import "server-only";
import type { ReportableProject } from "@/lib/capture-types";
import { inOrg } from "./db";

/** Projects someone can report bugs to (bug.create), with active versions, platforms and features, for the extension. */
export async function listReportableProjects(
  org: { id: string; slug: string; name: string },
  userId: string,
  isAdmin: boolean,
): Promise<ReportableProject[]> {
  return inOrg(org.id, async (tx) => {
    const projects = await tx.query<{ id: string; key: string; name: string }>(
      `select p.id, p.key, p.name from projects p
        where p.organization_id = $1 and p.deleted_at is null and p.status = 'active'
          and ($3 or exists (
            select 1 from project_members pm join role_permissions rp on rp.role_id = pm.role_id
             where pm.project_id = p.id and pm.user_id = $2 and rp.permission_key = 'bug.create'))
        order by p.name`,
      [org.id, userId, isAdmin],
    );
    if (projects.length === 0) return [];
    const ids = projects.map((p) => p.id);
    const versions = await tx.query<{ project_id: string; id: string; name: string; status: string }>(
      `select project_id, id, name, status from project_versions
        where project_id = any($1::uuid[]) and status <> 'archived' order by sort_order desc, created_at desc`,
      [ids],
    );
    const platforms = await tx.query<{ project_id: string; id: string; name: string }>(
      `select project_id, id, name from project_platforms
        where project_id = any($1::uuid[]) and archived_at is null order by position, created_at`,
      [ids],
    );
    const components = await tx.query<{ project_id: string; id: string; name: string }>(
      `select project_id, id, name from project_components
        where project_id = any($1::uuid[]) and archived_at is null order by lower(name)`,
      [ids],
    );
    return projects.map((p) => ({
      ...p,
      organization: { slug: org.slug, name: org.name },
      versions: versions.filter((v) => v.project_id === p.id).map(({ id, name, status }) => ({ id, name, status })),
      platforms: platforms.filter((pl) => pl.project_id === p.id).map(({ id, name }) => ({ id, name })),
      components: components.filter((c) => c.project_id === p.id).map(({ id, name }) => ({ id, name })),
    }));
  });
}
