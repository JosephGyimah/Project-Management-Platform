alter table users
  add column if not exists role text not null default 'member' check (role in ('admin', 'project_lead', 'member')),
  add column if not exists password_hash text;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_sessions_user_id on user_sessions (user_id);
create index if not exists idx_user_sessions_expires_at on user_sessions (expires_at);
