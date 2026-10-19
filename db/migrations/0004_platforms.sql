-- Platforms: the products one project covers, such as Admin panel, User website, Vendor website and
-- User app. Each bug can say which one it was found on; the bug list has a tab per platform.
create table project_platforms (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  project_id      uuid not null,
  name            text not null check (length(btrim(name)) between 1 and 100),
  position        integer not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  unique (project_id, id)
);

-- One active platform per name in a project; a removed one can be added again.
create unique index project_platforms_name_key on project_platforms (project_id, lower(name)) where archived_at is null;
create index project_platforms_project_idx on project_platforms (project_id, position);

create trigger project_platforms_set_updated_at before update on project_platforms
  for each row execute function set_updated_at();

alter table project_platforms enable row level security;
create policy tenant_isolation on project_platforms
  using (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

alter table bugs
  add column platform_id uuid,
  add foreign key (project_id, platform_id) references project_platforms (project_id, id) on delete set null (platform_id);

create index bugs_platform_idx on bugs (platform_id) where platform_id is not null;
