-- Replies: a comment can answer another one (one level deep; replies to a reply join the same thread).
alter table bug_comments
  add column parent_id uuid references bug_comments (id) on delete cascade;
create index bug_comments_parent_idx on bug_comments (parent_id) where parent_id is not null;
