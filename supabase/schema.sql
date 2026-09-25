create table if not exists notes (
  id bigserial primary key,
  telegram_update_id bigint unique,
  chat_id bigint not null,
  message_id bigint,
  text text not null,
  score int,
  score_reason text,
  outcome text not null default 'received', -- received | scored_out | drafted | error
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id bigserial primary key,
  note_id bigint not null references notes(id),
  body text not null,
  news jsonb,
  model text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists voice_skill (
  id bigserial primary key,
  content text not null,
  created_at timestamptz not null default now()
);

alter table notes enable row level security;
alter table drafts enable row level security;
alter table voice_skill enable row level security;
-- No policies on purpose: only the server (direct Postgres connection) reads/writes.
