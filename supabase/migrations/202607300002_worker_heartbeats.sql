create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  scheduler_enabled boolean not null,
  fmp_enabled boolean not null,
  codex_enabled boolean not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_last_seen_at
  on public.worker_heartbeats (last_seen_at desc);

alter table public.worker_heartbeats enable row level security;
