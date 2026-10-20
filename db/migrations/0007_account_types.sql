-- Account types. An Organization account owns a team organization: it creates projects and invites
-- developers and QA. A Personal account works alone in a personal workspace: an organization of kind
-- 'personal' with one project, set up at sign-up, that it can't add projects or people to.
alter table organizations
  add column kind text not null default 'organization' check (kind in ('organization', 'personal'));

-- One personal workspace per person.
create unique index organizations_one_personal_key on organizations (created_by) where kind = 'personal' and deleted_at is null;

-- The owner of a personal workspace has no organization permissions (no new projects, no members);
-- they look after their one project through its project role.
insert into roles (scope, key, name, description) values
  ('organization', 'personal', 'Personal', 'Owns a personal workspace');

-- Invitations also say what the person does on projects (Developer or SQA engineer) and on which ones:
-- null means every active project when they accept. The person can decline instead of accepting.
alter table invitations
  add column project_role_id    uuid,
  add column project_role_scope role_scope not null default 'project' check (project_role_scope = 'project'),
  add column project_ids        uuid[],
  add column emailed_at         timestamptz,
  add column declined_at        timestamptz,
  add foreign key (project_role_id, project_role_scope) references roles (id, scope),
  add check (num_nonnulls(accepted_at, revoked_at, declined_at) <= 1);

drop index invitations_one_open_key;
create unique index invitations_one_open_key on invitations (organization_id, email)
  where accepted_at is null and revoked_at is null and declined_at is null;

-- Where a session was started: the web app (a cookie) or the browser extension (a bearer token).
alter table sessions
  add column client text not null default 'web' check (client in ('web', 'extension'));
