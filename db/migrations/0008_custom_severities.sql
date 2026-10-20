-- Severity levels become a list each organization manages, like its statuses: members can add, rename,
-- recolour, reorder and remove them. Bugs point at a level instead of holding a fixed value.
create table bug_severities (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 50),
  color           text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Most severe first; "sort by severity" follows it.
  position        integer not null,
  -- New bugs get this level unless the reporter picks another.
  is_default      boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, position) deferrable initially deferred,
  check (not (is_default and archived_at is not null))
);
create unique index bug_severities_name_key on bug_severities (organization_id, lower(name)) where archived_at is null;
create unique index bug_severities_one_default_key on bug_severities (organization_id) where is_default;

create trigger bug_severities_set_updated_at before update on bug_severities
  for each row execute function set_updated_at();

alter table bug_severities enable row level security;
create policy tenant_isolation on bug_severities
  using (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

-- Every organization starts with the four levels it had.
insert into bug_severities (organization_id, name, color, position, is_default)
select o.id, v.name, v.color, v.position, v.is_default
  from organizations o
 cross join (values ('Critical', '#dc2626', 1, false), ('High', '#ea580c', 2, false),
                    ('Medium', '#ca8a04', 3, true), ('Low', '#64748b', 4, false)) v(name, color, position, is_default);

alter table bugs add column severity_id uuid;
update bugs b set severity_id = s.id
  from bug_severities s
 where s.organization_id = b.organization_id and lower(s.name) = b.severity::text;
alter table bugs
  alter column severity_id set not null,
  add foreign key (organization_id, severity_id) references bug_severities (organization_id, id);
create index bugs_severity_idx on bugs (severity_id);
alter table bugs drop column severity;
drop type bug_severity;

-- History used the old values ("high"); show them as the levels are now named ("High").
update bug_activity
   set old_value = case when jsonb_typeof(old_value) = 'string' then to_jsonb(initcap(old_value #>> '{}')) else old_value end,
       new_value = case when jsonb_typeof(new_value) = 'string' then to_jsonb(initcap(new_value #>> '{}')) else new_value end
 where field = 'severity';

-- New organizations get the same levels along with their statuses.
create or replace function create_default_workflow() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into workflow_statuses (organization_id, name, category, position, is_initial, color) values
    (new.id, 'Open',         'open',        1, true,  '#64748b'),
    (new.id, 'In progress',  'in_progress', 2, false, '#2563eb'),
    (new.id, 'Ready for QA', 'in_review',   3, false, '#9333ea'),
    (new.id, 'Reopened',     'open',        4, false, '#dc2626'),
    (new.id, 'Closed',       'done',        5, false, '#16a34a');
  insert into bug_severities (organization_id, name, color, position, is_default) values
    (new.id, 'Critical', '#dc2626', 1, false),
    (new.id, 'High',     '#ea580c', 2, false),
    (new.id, 'Medium',   '#ca8a04', 3, true),
    (new.id, 'Low',      '#64748b', 4, false);
  return new;
end $$;

-- A removed status's name can be used again.
drop index workflow_statuses_name_key;
create unique index workflow_statuses_name_key on workflow_statuses (organization_id, lower(name)) where archived_at is null;
