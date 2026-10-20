-- Statuses and severity levels belong to each project rather than the whole organization, so one project
-- can add "Blocked" or "Trivial" without changing the others. Every project gets its own copy of its
-- organization's lists as they are now (names, colours, order, defaults), and its bugs move onto it.

alter table workflow_statuses add column project_id uuid;
alter table bug_severities add column project_id uuid;

-- Uniqueness was per organization; the copies would collide until it's per project.
alter table workflow_statuses drop constraint workflow_statuses_organization_id_position_key;
alter table bug_severities drop constraint bug_severities_organization_id_position_key;
drop index workflow_statuses_name_key;
drop index workflow_statuses_one_initial_key;
drop index bug_severities_name_key;
drop index bug_severities_one_default_key;

-- Each organization row, and its copy in each of the organization's projects.
create temporary table status_copies on commit drop as
  select s.id as old_id, p.id as project_id, uuidv7() as new_id
    from workflow_statuses s join projects p on p.organization_id = s.organization_id
   where s.project_id is null;
create temporary table severity_copies on commit drop as
  select v.id as old_id, p.id as project_id, uuidv7() as new_id
    from bug_severities v join projects p on p.organization_id = v.organization_id
   where v.project_id is null;

insert into workflow_statuses (id, organization_id, project_id, name, category, color, position, is_initial, archived_at, created_at)
select c.new_id, s.organization_id, c.project_id, s.name, s.category, s.color, s.position, s.is_initial, s.archived_at, s.created_at
  from status_copies c join workflow_statuses s on s.id = c.old_id;
insert into bug_severities (id, organization_id, project_id, name, color, position, is_default, archived_at, created_at)
select c.new_id, v.organization_id, c.project_id, v.name, v.color, v.position, v.is_default, v.archived_at, v.created_at
  from severity_copies c join bug_severities v on v.id = c.old_id;

-- Transition rules, if an organization defined any, apply in each project.
insert into workflow_transitions (organization_id, from_status_id, to_status_id, permission_key)
select t.organization_id, f.new_id, tt.new_id, t.permission_key
  from workflow_transitions t
  join status_copies f on f.old_id = t.from_status_id
  join status_copies tt on tt.old_id = t.to_status_id and tt.project_id = f.project_id;

-- Bugs move to their project's copies. Their own triggers are off meanwhile, so nothing else about them
-- changes: not their "updated" time, not their edit counter.
alter table bugs disable trigger user;
update bugs b set status_id = c.new_id from status_copies c where c.old_id = b.status_id and c.project_id = b.project_id;
update bugs b set severity_id = c.new_id from severity_copies c where c.old_id = b.severity_id and c.project_id = b.project_id;
alter table bugs enable trigger user;

-- The organization rows are no longer used (their transitions go with them).
delete from workflow_statuses where project_id is null;
delete from bug_severities where project_id is null;

alter table workflow_statuses
  alter column project_id set not null,
  add foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  add unique (project_id, id),
  add unique (project_id, position) deferrable initially deferred;
create unique index workflow_statuses_name_key on workflow_statuses (project_id, lower(name)) where archived_at is null;
create unique index workflow_statuses_one_initial_key on workflow_statuses (project_id) where is_initial;

alter table bug_severities
  alter column project_id set not null,
  add foreign key (organization_id, project_id) references projects (organization_id, id) on delete cascade,
  add unique (project_id, id),
  add unique (project_id, position) deferrable initially deferred;
create unique index bug_severities_name_key on bug_severities (project_id, lower(name)) where archived_at is null;
create unique index bug_severities_one_default_key on bug_severities (project_id) where is_default;

-- A bug's status and severity come from its own project.
alter table bugs
  add foreign key (project_id, status_id) references workflow_statuses (project_id, id) deferrable,
  add foreign key (project_id, severity_id) references bug_severities (project_id, id) deferrable;

-- New projects start with the default lists; organizations no longer hold any.
drop trigger organizations_default_workflow on organizations;
drop function create_default_workflow();

create function create_project_workflow() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into workflow_statuses (organization_id, project_id, name, category, position, is_initial, color) values
    (new.organization_id, new.id, 'Open',         'open',        1, true,  '#64748b'),
    (new.organization_id, new.id, 'In progress',  'in_progress', 2, false, '#2563eb'),
    (new.organization_id, new.id, 'Ready for QA', 'in_review',   3, false, '#9333ea'),
    (new.organization_id, new.id, 'Reopened',     'open',        4, false, '#dc2626'),
    (new.organization_id, new.id, 'Closed',       'done',        5, false, '#16a34a');
  insert into bug_severities (organization_id, project_id, name, color, position, is_default) values
    (new.organization_id, new.id, 'Critical', '#dc2626', 1, false),
    (new.organization_id, new.id, 'High',     '#ea580c', 2, false),
    (new.organization_id, new.id, 'Medium',   '#ca8a04', 3, true),
    (new.organization_id, new.id, 'Low',      '#64748b', 4, false);
  return new;
end $$;

create trigger projects_default_workflow after insert on projects
  for each row execute function create_project_workflow();

-- A new bug starts in its project's first status (it was the organization's).
create or replace function bugs_before_write() returns trigger language plpgsql as $$
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
        where project_id = new.project_id and is_initial;
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
