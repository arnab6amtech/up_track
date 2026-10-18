-- UpTrack database schema
-- Target: PostgreSQL 18 (uses uuidv7()). On PostgreSQL 15–17, replace `uuidv7()` with `gen_random_uuid()`
-- or generate UUIDv7 values in the application.
--
-- Conventions
--   * Every tenant-owned table carries organization_id. Composite foreign keys that include it make it
--     impossible to link rows from two different organizations (e.g. a bug in org A pointing at a
--     version of a project in org B).
--   * Primary keys are time-ordered UUIDv7s: safe to expose, no hot-spot on inserts, index-friendly.
--   * Timestamps are timestamptz in UTC. updated_at is maintained by a trigger.
--   * Rows people may want back (users, organizations, projects, bugs) are soft-deleted with deleted_at;
--     a background job purges them later. Hard-deleting an organization cascades to all of its data:
--       begin; set constraints all deferred; delete from organizations where id = $1; commit;
--   * Files (screenshots, recordings, logs) live in object storage; the database stores their keys.

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------------

create type user_status       as enum ('active', 'disabled');
create type membership_status as enum ('active', 'suspended', 'removed');
create type role_scope        as enum ('organization', 'project');
create type project_status    as enum ('active', 'archived');
create type version_status    as enum ('planned', 'in_development', 'in_testing', 'released', 'archived');
create type status_category   as enum ('open', 'in_progress', 'in_review', 'done');
create type bug_resolution    as enum ('fixed', 'wont_fix', 'duplicate', 'cannot_reproduce', 'by_design', 'deferred');
create type bug_severity      as enum ('critical', 'high', 'medium', 'low');
create type bug_priority      as enum ('urgent', 'high', 'medium', 'low');
create type bug_source        as enum ('manual', 'browser_extension', 'import', 'api');
create type attachment_kind   as enum ('image', 'video', 'log', 'file');
create type bug_link_type     as enum ('duplicates', 'blocks', 'relates_to');
create type data_source_kind  as enum ('google_drive', 'upload');

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------------------------------

create table users (
  id                uuid primary key default uuidv7(),
  email             citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name         text not null check (length(btrim(full_name)) between 1 and 200),
  avatar_url        text,
  password_hash     text,                         -- null for people who only sign in with SSO
  email_verified_at timestamptz,
  status            user_status not null default 'active',
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index users_email_key on users (email) where deleted_at is null;

-- SSO / OAuth logins linked to a user (Google, GitHub, SAML...).
create table user_identities (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users (id) on delete cascade,
  provider         text not null,
  provider_user_id text not null,
  created_at       timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index user_identities_user_id_idx on user_identities (user_id);

-- ---------------------------------------------------------------------------------------------------
-- Organizations, roles and members
-- ---------------------------------------------------------------------------------------------------

create table organizations (
  id         uuid primary key default uuidv7(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 63),
  plan       text not null default 'free',
  settings   jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index organizations_slug_key on organizations (slug) where deleted_at is null;

-- Fine-grained capabilities, e.g. 'bug.create'. Reference data, managed by migrations.
create table permissions (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  scope       role_scope not null,
  description text not null,
  unique (key, scope)
);

-- Roles bundle permissions. Built-in roles (organization_id null) exist for every organization;
-- organizations can add their own custom roles.
create table roles (
  id              uuid primary key default uuidv7(),
  organization_id uuid references organizations (id) on delete cascade,
  scope           role_scope not null,
  key             text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name            text not null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (organization_id, scope, key),
  unique (id, scope)                                   -- target for scope-checked foreign keys
);
create index roles_organization_id_idx on roles (organization_id);

create table role_permissions (
  role_id          uuid not null,
  role_scope       role_scope not null,
  permission_key   text not null,
  permission_scope role_scope not null,
  primary key (role_id, permission_key),
  foreign key (role_id, role_scope) references roles (id, scope) on delete cascade,
  foreign key (permission_key, permission_scope) references permissions (key, scope) on delete cascade,
  check (role_scope = permission_scope)                -- project roles only get project permissions
);
create index role_permissions_permission_key_idx on role_permissions (permission_key);

-- A person's membership of an organization. Rows are never hard-deleted while the organization exists
-- (status = 'removed'), so bugs keep pointing at the people who reported or fixed them.
create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references users (id),
  role_id         uuid not null,
  role_scope      role_scope not null default 'organization' check (role_scope = 'organization'),
  status          membership_status not null default 'active',
  job_title       text,                                -- shown in the UI, e.g. "SQA engineer"
  invited_by      uuid references users (id) on delete set null,
  joined_at       timestamptz not null default now(),
  removed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (role_id, role_scope) references roles (id, scope),
  check ((status = 'removed') = (removed_at is not null))
);
create index organization_members_user_id_idx on organization_members (user_id);
create index organization_members_role_id_idx on organization_members (role_id);

create table invitations (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  email            citext not null,
  role_id          uuid not null,
  role_scope       role_scope not null default 'organization' check (role_scope = 'organization'),
  token_hash       bytea not null unique,              -- sha-256 of the emailed token; never store the token
  invited_by       uuid references users (id) on delete set null,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_user_id uuid references users (id) on delete set null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (role_id, role_scope) references roles (id, scope) on delete cascade,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);
-- At most one open invitation per person per organization.
create unique index invitations_one_open_key on invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- Optional grouping of members, e.g. "Backend" or "QA".
create table teams (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 100),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index teams_name_key on teams (organization_id, lower(name));

create table team_members (
  organization_id uuid not null,
  team_id         uuid not null,
  user_id         uuid not null,
  added_at        timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (organization_id, team_id) references teams (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references organization_members (organization_id, user_id) on delete cascade
);
create index team_members_member_idx on team_members (organization_id, user_id);

-- ---------------------------------------------------------------------------------------------------
-- Projects, versions and components
-- ---------------------------------------------------------------------------------------------------

create table projects (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 200),
  key             text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),  -- bug key prefix: UPT-42
  description     text,
  status          project_status not null default 'active',
  next_bug_number integer not null default 1 check (next_bug_number > 0),
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  deleted_at      timestamptz,
  unique (organization_id, id),
  check ((status = 'archived') = (archived_at is not null))
);
create unique index projects_key_key on projects (organization_id, key) where deleted_at is null;
create unique index projects_name_key on projects (organization_id, lower(name)) where deleted_at is null;

-- Who works on a project and in which role (manager, developer, SQA, viewer).
-- Members must already belong to the project's organization.
create table project_members (
  organization_id uuid not null,
  project_id      uuid not null,
  user_id         uuid not null,
  role_id         uuid not null,
  role_scope      role_scope not null default 'project' check (role_scope = 'project'),
  added_by        uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references organization_members (organization_id, user_id) on delete cascade,
  foreign key (role_id, role_scope) references roles (id, scope)
);
create index project_members_member_idx on project_members (organization_id, user_id);
create index project_members_role_id_idx on project_members (role_id);

create table project_versions (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  project_id      uuid not null,
  name            text not null check (length(btrim(name)) between 1 and 100),  -- "16.6", "2026.10"
  description     text,
  status          version_status not null default 'planned',
  start_date      date,
  release_date    date,                                -- planned release
  released_at     timestamptz,                         -- actual release
  sort_order      integer not null default 0,
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  unique (project_id, id),                             -- lets bugs prove a version is in their project
  check (release_date is null or start_date is null or release_date >= start_date),
  check (status <> 'released' or released_at is not null)
);
create unique index project_versions_name_key on project_versions (project_id, lower(name));
create index project_versions_status_idx on project_versions (project_id, status);

-- Modules / areas of a project ("Admin panel", "Checkout"), optionally nested.
create table project_components (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  project_id      uuid not null,
  parent_id       uuid,
  name            text not null check (length(btrim(name)) between 1 and 100),
  description     text,
  lead_user_id    uuid,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  unique (project_id, id),
  foreign key (project_id, parent_id) references project_components (project_id, id) on delete cascade,
  foreign key (organization_id, lead_user_id) references organization_members (organization_id, user_id)
    on delete set null (lead_user_id),
  check (parent_id is null or parent_id <> id)
);
-- Sibling names are unique; top-level components use the project id as their "parent" here.
create unique index project_components_name_key
  on project_components (project_id, coalesce(parent_id, project_id), lower(name));

-- ---------------------------------------------------------------------------------------------------
-- Workflow
-- ---------------------------------------------------------------------------------------------------

-- Each organization has its own statuses. The category drives behaviour (what counts as open, when a
-- resolution is required); the name is whatever the team calls it.
create table workflow_statuses (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 50),
  category        status_category not null,
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),
  position        integer not null,
  is_initial      boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, position) deferrable initially deferred,
  check (not is_initial or category = 'open')
);
create unique index workflow_statuses_name_key on workflow_statuses (organization_id, lower(name));
create unique index workflow_statuses_one_initial_key on workflow_statuses (organization_id) where is_initial;

-- Allowed status changes. If an organization defines none, every change is allowed.
-- permission_key restricts who may make the move, e.g. only SQA may close a bug.
create table workflow_transitions (
  organization_id uuid not null,
  from_status_id  uuid not null,
  to_status_id    uuid not null,
  permission_key  text references permissions (key),
  primary key (from_status_id, to_status_id),
  foreign key (organization_id, from_status_id) references workflow_statuses (organization_id, id) on delete cascade,
  foreign key (organization_id, to_status_id) references workflow_statuses (organization_id, id) on delete cascade,
  check (from_status_id <> to_status_id)
);
create index workflow_transitions_to_idx on workflow_transitions (to_status_id);

-- ---------------------------------------------------------------------------------------------------
-- Bugs
-- ---------------------------------------------------------------------------------------------------

create table bugs (
  id                  uuid primary key default uuidv7(),
  organization_id     uuid not null,
  project_id          uuid not null,
  number              integer not null check (number > 0),   -- per project; shown as <project key>-<number>
  title               text not null check (length(btrim(title)) between 1 and 300),
  description         text,
  steps_to_reproduce  text,
  expected_result     text,
  actual_result       text,
  environment         text,                                  -- free text for manual reports
  found_in_version_id uuid not null,                         -- required: the version the SQA engineer tested
  fixed_in_version_id uuid,
  component_id        uuid,
  status_id           uuid not null,
  resolution          bug_resolution,
  severity            bug_severity not null default 'medium',
  priority            bug_priority not null default 'medium',
  reporter_id         uuid not null,
  assignee_id         uuid,
  source              bug_source not null default 'manual',
  external_ref        text,                                  -- e.g. spreadsheet tab and row it came from
  due_date            date,
  resolved_at         timestamptz,                           -- set when the bug enters a "done" status
  lock_version        integer not null default 0,            -- optimistic locking for concurrent edits
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  search_vector       tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(actual_result, '')), 'B')
  ) stored,
  unique (project_id, number),
  unique (organization_id, id),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  -- The history-protecting keys below are DEFERRABLE: checked immediately in normal use, but the job
  -- that purges a whole organization defers them so the cascade can remove everything in one go.
  foreign key (project_id, found_in_version_id) references project_versions (project_id, id) deferrable,
  foreign key (project_id, fixed_in_version_id) references project_versions (project_id, id) deferrable,
  foreign key (project_id, component_id) references project_components (project_id, id)
    on delete set null (component_id),
  foreign key (organization_id, status_id) references workflow_statuses (organization_id, id) deferrable,
  foreign key (organization_id, reporter_id) references organization_members (organization_id, user_id) deferrable,
  foreign key (organization_id, assignee_id) references organization_members (organization_id, user_id)
    on delete set null (assignee_id)
);
create index bugs_project_status_idx    on bugs (project_id, status_id) where deleted_at is null;
create index bugs_found_version_idx     on bugs (project_id, found_in_version_id) where deleted_at is null;
create index bugs_fixed_version_idx     on bugs (fixed_in_version_id) where fixed_in_version_id is not null;
create index bugs_component_idx         on bugs (component_id) where component_id is not null;
create index bugs_assignee_open_idx     on bugs (organization_id, assignee_id, priority) where deleted_at is null and resolved_at is null;
create index bugs_reporter_idx          on bugs (organization_id, reporter_id, created_at desc);
create index bugs_status_idx            on bugs (organization_id, status_id);
create index bugs_project_updated_idx   on bugs (project_id, updated_at desc) where deleted_at is null;
create index bugs_search_idx            on bugs using gin (search_vector);
create index bugs_title_trgm_idx        on bugs using gin (title gin_trgm_ops);
create unique index bugs_external_ref_key on bugs (project_id, external_ref) where external_ref is not null;

-- Files attached to a bug. The bytes live in object storage under storage_key.
create table bug_attachments (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  bug_id          uuid not null,
  kind            attachment_kind not null,
  storage_key     text not null unique,
  file_name       text not null check (length(file_name) between 1 and 255),
  content_type    text not null,
  size_bytes      bigint not null check (size_bytes > 0),
  checksum_sha256 bytea check (octet_length(checksum_sha256) = 32),
  width           integer check (width > 0),
  height          integer check (height > 0),
  duration_ms     integer check (duration_ms >= 0),
  uploaded_by     uuid,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade,
  foreign key (organization_id, uploaded_by) references organization_members (organization_id, user_id)
    on delete set null (uploaded_by)
);
create index bug_attachments_bug_idx on bug_attachments (bug_id) where deleted_at is null;

-- Page context recorded by the browser extension (one per bug reported that way).
create table bug_captures (
  bug_id               uuid primary key,
  organization_id      uuid not null,
  page_url             text not null,
  page_title           text,
  user_agent           text,
  browser              text,                           -- "Chrome 155"
  os                   text,                           -- "macOS"
  viewport_width       integer check (viewport_width >= 0),
  viewport_height      integer check (viewport_height >= 0),
  device_pixel_ratio   numeric(4, 2),
  language             text,
  timezone             text,
  log_attachment_id    uuid references bug_attachments (id) on delete set null,  -- full API/console log
  request_count        integer not null default 0 check (request_count >= 0),
  failed_request_count integer not null default 0 check (failed_request_count >= 0),
  console_error_count  integer not null default 0 check (console_error_count >= 0),
  captured_at          timestamptz not null,
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade,
  check (failed_request_count <= request_count)
);

-- Failed API calls from a capture, as rows, so "which bugs hit POST /api/coupons with a 500?" is a query.
-- The complete log (including successful calls and bodies) stays in the log attachment.
create table bug_network_failures (
  id               bigint generated always as identity,
  organization_id  uuid not null,
  bug_id           uuid not null,
  method           text not null,
  host             text not null,
  path             text not null,
  status_code      smallint not null check (status_code between 0 and 999),  -- 0 = no response
  duration_ms      integer check (duration_ms >= 0),
  started_at       timestamptz not null,
  error            text,
  response_excerpt text check (length(response_excerpt) <= 2000),
  primary key (bug_id, id),
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade
);
create index bug_network_failures_endpoint_idx on bug_network_failures (organization_id, host, path, status_code);

create table bug_comments (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  bug_id          uuid not null,
  author_id       uuid not null,
  body            text not null check (length(btrim(body)) between 1 and 20000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade,
  foreign key (organization_id, author_id) references organization_members (organization_id, user_id) deferrable
);
create index bug_comments_bug_idx on bug_comments (bug_id, created_at);

-- Append-only history of every change, for the activity feed and audits.
create table bug_activity (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  bug_id          uuid not null,
  actor_id        uuid references users (id) on delete set null,     -- null for system changes
  action          text not null check (action in (
                    'created', 'updated', 'status_changed', 'assigned', 'commented',
                    'attachment_added', 'linked', 'deleted', 'restored')),
  field           text,
  old_value       jsonb,
  new_value       jsonb,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade
);
create index bug_activity_bug_idx on bug_activity (bug_id, created_at desc);

create table bug_watchers (
  organization_id uuid not null,
  bug_id          uuid not null,
  user_id         uuid not null,
  created_at      timestamptz not null default now(),
  primary key (bug_id, user_id),
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references organization_members (organization_id, user_id) on delete cascade
);
create index bug_watchers_user_idx on bug_watchers (organization_id, user_id);

create table labels (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 50),
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index labels_name_key on labels (organization_id, lower(name));

create table bug_labels (
  organization_id uuid not null,
  bug_id          uuid not null,
  label_id        uuid not null,
  primary key (bug_id, label_id),
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade,
  foreign key (organization_id, label_id) references labels (organization_id, id) on delete cascade
);
create index bug_labels_label_idx on bug_labels (label_id);

create table bug_links (
  organization_id uuid not null,
  source_bug_id   uuid not null,
  target_bug_id   uuid not null,
  link_type       bug_link_type not null,
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (source_bug_id, target_bug_id, link_type),
  foreign key (organization_id, source_bug_id) references bugs (organization_id, id) on delete cascade,
  foreign key (organization_id, target_bug_id) references bugs (organization_id, id) on delete cascade,
  check (source_bug_id <> target_bug_id)
);
create index bug_links_target_idx on bug_links (target_bug_id);
-- "relates to" has no direction, so A→B and B→A are the same link.
create unique index bug_links_relates_to_key on bug_links
  (least(source_bug_id, target_bug_id), greatest(source_bug_id, target_bug_id)) where link_type = 'relates_to';

-- Revocable, expiring share links (replaces "the unguessable id is the link").
create table bug_share_links (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  bug_id          uuid not null,
  token_hash      bytea not null unique,
  created_by      uuid references users (id) on delete set null,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  view_count      integer not null default 0 check (view_count >= 0),
  last_viewed_at  timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, bug_id) references bugs (organization_id, id) on delete cascade
);
create index bug_share_links_bug_idx on bug_share_links (bug_id);

-- ---------------------------------------------------------------------------------------------------
-- Integrations and security
-- ---------------------------------------------------------------------------------------------------

-- Personal tokens for the browser extension, the MCP server and the API.
create table api_tokens (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  user_id         uuid not null,
  name            text not null check (length(btrim(name)) between 1 and 100),
  token_prefix    text not null check (length(token_prefix) between 4 and 12),  -- shown in the UI
  token_hash      bytea not null unique,
  scopes          text[] not null default '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references organization_members (organization_id, user_id) on delete cascade
);
create index api_tokens_member_idx on api_tokens (organization_id, user_id);

-- Spreadsheets kept in sync with a project version (today's "workbooks").
create table data_sources (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null,
  project_id      uuid not null,
  version_id      uuid,
  kind            data_source_kind not null,
  name            text not null,
  config          jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),        -- drive file id, upload key
  column_mapping  jsonb not null default '{}' check (jsonb_typeof(column_mapping) = 'object'),
  last_synced_at  timestamptz,
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  foreign key (project_id, version_id) references project_versions (project_id, id) on delete cascade
);
create index data_sources_project_idx on data_sources (project_id);

-- Security-relevant events: sign-ins, role changes, token creation, exports, deletions.
create table audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid references organizations (id) on delete cascade,
  actor_id        uuid references users (id) on delete set null,
  action          text not null,
  target_type     text not null,
  target_id       uuid,
  ip_address      inet,
  user_agent      text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index audit_log_org_time_idx on audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------
-- Rules a foreign key can't express
-- ---------------------------------------------------------------------------------------------------

-- A member's role must be a built-in role or one of the member's own organization's roles.
create function check_role_belongs_to_org() returns trigger language plpgsql as $$
declare role_org uuid;
begin
  select organization_id into role_org from roles where id = new.role_id;
  if role_org is not null and role_org <> new.organization_id then
    raise exception 'role % belongs to another organization', new.role_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger organization_members_role_org before insert or update of role_id on organization_members
  for each row execute function check_role_belongs_to_org();
create trigger project_members_role_org before insert or update of role_id on project_members
  for each row execute function check_role_belongs_to_org();
create trigger invitations_role_org before insert or update of role_id on invitations
  for each row execute function check_role_belongs_to_org();

-- Bugs: assign the per-project number, default the status, keep resolution and resolved_at consistent
-- with the status category, and require reporter/assignee to be active project members.
create function bugs_before_write() returns trigger language plpgsql as $$
declare
  cat status_category;
begin
  if tg_op = 'INSERT' then
    if new.number is null then
      update projects set next_bug_number = next_bug_number + 1
        where id = new.project_id
        returning next_bug_number - 1 into new.number;
    end if;
    if new.status_id is null then
      select id into new.status_id from workflow_statuses
        where organization_id = new.organization_id and is_initial;
    end if;
  else
    new.lock_version := old.lock_version + 1;
  end if;

  select category into cat from workflow_statuses where id = new.status_id;
  if cat = 'done' then
    if new.resolution is null then
      raise exception 'a resolution is required to move a bug to a done status' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or old.status_id is distinct from new.status_id then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
  else
    new.resolution := null;
    new.resolved_at := null;
  end if;

  if (tg_op = 'INSERT' or new.reporter_id is distinct from old.reporter_id) and not exists (
      select 1 from project_members pm join organization_members om using (organization_id, user_id)
      where pm.project_id = new.project_id and pm.user_id = new.reporter_id and om.status = 'active') then
    raise exception 'the reporter must be an active member of the project' using errcode = 'foreign_key_violation';
  end if;
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) and not exists (
      select 1 from project_members pm join organization_members om using (organization_id, user_id)
      where pm.project_id = new.project_id and pm.user_id = new.assignee_id and om.status = 'active') then
    raise exception 'the assignee must be an active member of the project' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger bugs_before_write before insert or update on bugs
  for each row execute function bugs_before_write();

-- Every new organization starts with a usable workflow.
-- Runs with the owner's rights: it writes rows of an organization that isn't "current" yet.
create function create_default_workflow() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into workflow_statuses (organization_id, name, category, position, is_initial, color) values
    (new.id, 'Open',         'open',        1, true,  '#64748b'),
    (new.id, 'In progress',  'in_progress', 2, false, '#2563eb'),
    (new.id, 'Ready for QA', 'in_review',   3, false, '#9333ea'),
    (new.id, 'Reopened',     'open',        4, false, '#dc2626'),
    (new.id, 'Closed',       'done',        5, false, '#16a34a');
  return new;
end $$;

create trigger organizations_default_workflow after insert on organizations
  for each row execute function create_default_workflow();

-- updated_at on every table that has it.
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Tenant isolation (defense in depth)
-- ---------------------------------------------------------------------------------------------------
-- The application connects as a non-owner role and sets the current organization per request:
--   set local app.current_org_id = '<uuid>';
-- Row-level security then hides every other organization's rows even if a query forgets its WHERE.
-- Migrations run as the table owner, which bypasses these policies.

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'organization_id'
             and table_name not in ('roles', 'audit_log')
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (organization_id = nullif(current_setting(''app.current_org_id'', true), '''')::uuid)',
      t);
  end loop;
end $$;

-- Before an organization is chosen, people still need to see which organizations they belong to.
-- The application sets app.current_user_id after sign-in.
create policy own_memberships on organization_members
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- Token sign-in happens before the organization is known, so it goes through this one narrow lookup
-- instead of reading api_tokens directly.
create function resolve_api_token(p_token_hash bytea)
returns table (token_id uuid, organization_id uuid, user_id uuid, scopes text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.organization_id, t.user_id, t.scopes
  from api_tokens t
  join organization_members m using (organization_id, user_id)
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now())
    and m.status = 'active'
$$;

-- ---------------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------------

insert into permissions (key, scope, description) values
  ('org.manage',          'organization', 'Edit organization settings and billing'),
  ('org.manage_members',  'organization', 'Invite, remove and change roles of members'),
  ('org.manage_roles',    'organization', 'Create and edit custom roles'),
  ('org.manage_workflow', 'organization', 'Edit statuses and transitions'),
  ('org.create_projects', 'organization', 'Create projects'),
  ('org.view_audit_log',  'organization', 'View the audit log'),
  ('project.manage',          'project', 'Edit project settings and members'),
  ('project.manage_versions', 'project', 'Create and release versions'),
  ('bug.view',                'project', 'View bugs'),
  ('bug.create',              'project', 'Report bugs'),
  ('bug.edit',                'project', 'Edit bug details'),
  ('bug.assign',              'project', 'Assign bugs'),
  ('bug.change_status',       'project', 'Move bugs between statuses'),
  ('bug.verify',              'project', 'Verify fixes and close bugs'),
  ('bug.delete',              'project', 'Delete bugs'),
  ('bug.comment',             'project', 'Comment on bugs'),
  ('bug.share',               'project', 'Create public share links');

insert into roles (scope, key, name, description) values
  ('organization', 'owner',     'Owner',     'Full control, including deleting the organization'),
  ('organization', 'admin',     'Admin',     'Manages members, roles, workflow and projects'),
  ('organization', 'member',    'Member',    'Works on the projects they are added to'),
  ('project',      'manager',   'Project manager', 'Manages the project, its versions and members'),
  ('project',      'developer', 'Developer', 'Fixes bugs'),
  ('project',      'sqa',       'SQA engineer', 'Reports and verifies bugs'),
  ('project',      'viewer',    'Viewer',    'Read-only access');

insert into role_permissions (role_id, role_scope, permission_key, permission_scope)
select r.id, r.scope, p.key, p.scope
from roles r
join permissions p on p.scope = r.scope
where r.organization_id is null
  and (
    (r.key = 'owner') or
    (r.key = 'admin' and p.key <> 'org.manage') or
    (r.key = 'manager') or
    (r.key = 'developer' and p.key in ('bug.view', 'bug.create', 'bug.edit', 'bug.change_status', 'bug.comment', 'bug.share')) or
    (r.key = 'sqa' and p.key in ('bug.view', 'bug.create', 'bug.edit', 'bug.assign', 'bug.change_status', 'bug.verify', 'bug.comment', 'bug.share')) or
    (r.key = 'viewer' and p.key = 'bug.view')
  );
