begin;

-- A compact read model for the Markets Overview. It is written by the worker
-- after a market state/memo is materialized, so page views do not reconstruct
-- the dashboard from the underlying market tables.
create table if not exists public.market_home_snapshots (
  snapshot_id uuid primary key references public.market_snapshots(id) on delete cascade,
  content jsonb not null,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists market_home_snapshots_generated_at
  on public.market_home_snapshots (generated_at desc);

alter table public.market_home_snapshots enable row level security;

commit;
