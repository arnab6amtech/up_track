-- Moments the reporter marked in a recording ("the bug happens here"): [{ "atMs": 3200, "label": "…" }, …],
-- in milliseconds from the start of the full recording.
alter table bug_attachments
  add column markers jsonb check (markers is null or jsonb_typeof(markers) = 'array');
