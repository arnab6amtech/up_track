-- Recordings can be trimmed to the part viewers should see; the full file is kept.
alter table bug_attachments
  add column trim_start_ms integer check (trim_start_ms >= 0),
  add column trim_end_ms   integer check (trim_end_ms > 0),
  add constraint bug_attachments_trim_check check (trim_start_ms is null or trim_end_ms is null or trim_end_ms > trim_start_ms);
