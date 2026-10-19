-- Browser sign-in sessions. The cookie holds a random token; only its SHA-256 hash is stored.
create table sessions (
  id           uuid primary key default uuidv7(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   bytea not null unique,
  user_agent   text,
  ip_address   inet,
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  check (expires_at > created_at)
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);
