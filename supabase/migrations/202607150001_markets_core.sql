begin;

create extension if not exists pgcrypto;

create table if not exists public.market_assets (
  symbol text primary key,
  name text not null,
  exchange text not null,
  asset_class text not null default 'us_equity',
  status text not null default 'active',
  tradable boolean not null default false,
  active boolean not null default true,
  source text not null default 'alpaca',
  source_as_of timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_bars_daily (
  symbol text not null references public.market_assets(symbol) on delete cascade,
  trading_date date not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume bigint not null,
  trade_count bigint,
  vwap numeric,
  feed text not null check (feed in ('delayed_sip', 'iex', 'sip')),
  source_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (symbol, trading_date, feed)
);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  feed text not null check (feed in ('delayed_sip', 'iex', 'sip')),
  status text not null default 'building' check (status in ('building', 'complete', 'failed')),
  data_as_of timestamptz not null,
  row_count integer not null default 0 check (row_count >= 0),
  is_latest boolean not null default false,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists market_snapshots_one_latest
  on public.market_snapshots (is_latest)
  where is_latest;

create table if not exists public.screener_rows (
  snapshot_id uuid not null references public.market_snapshots(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  company text not null,
  price numeric not null,
  daily_change numeric not null,
  gap numeric not null,
  volume bigint not null,
  relative_volume numeric not null,
  range_values jsonb not null default '[]'::jsonb,
  fifty_day_average numeric not null,
  fifty_two_week_position numeric not null,
  exchange text not null,
  tradable boolean not null,
  data_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, symbol)
);

create index if not exists screener_rows_snapshot_relative_volume
  on public.screener_rows (snapshot_id, relative_volume desc);

create index if not exists screener_rows_snapshot_daily_change
  on public.screener_rows (snapshot_id, daily_change desc);

create table if not exists public.market_states (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.market_snapshots(id) on delete cascade,
  regime text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  inputs jsonb not null default '{}'::jsonb,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  unique (snapshot_id)
);

create table if not exists public.market_memos (
  id uuid primary key default gen_random_uuid(),
  market_state_id uuid not null references public.market_states(id) on delete cascade,
  content jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  provider text not null,
  model text not null,
  generated_at timestamptz not null default now(),
  unique (market_state_id)
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  claimed_by text,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_jobs_claim_queue
  on public.agent_jobs (priority, run_after, created_at)
  where status = 'queued';

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.agent_jobs(id) on delete cascade,
  worker_id text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  provider text,
  model text,
  input_refs jsonb not null default '[]'::jsonb,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
);

create or replace function public.publish_screener_snapshot(p_snapshot_id uuid)
returns public.market_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  published public.market_snapshots;
  actual_count integer;
begin
  select count(*) into actual_count from public.screener_rows where snapshot_id = p_snapshot_id;
  if actual_count = 0 then
    raise exception 'Cannot publish an empty screener snapshot';
  end if;

  update public.market_snapshots set is_latest = false where is_latest;
  update public.market_snapshots
    set status = 'complete', is_latest = true, row_count = actual_count, published_at = now(), error = null
    where id = p_snapshot_id and status = 'building'
    returning * into published;

  if published.id is null then
    raise exception 'Snapshot is missing or is not building';
  end if;

  return published;
end;
$$;

create or replace function public.claim_agent_job(p_worker_id text)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.agent_jobs;
begin
  select * into claimed
  from public.agent_jobs
  where status = 'queued'
    and run_after <= now()
    and attempts < max_attempts
  order by priority asc, run_after asc, created_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update public.agent_jobs
    set status = 'running', claimed_by = p_worker_id, claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = claimed.id
    returning * into claimed;

  return claimed;
end;
$$;

alter table public.market_assets enable row level security;
alter table public.market_bars_daily enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.screener_rows enable row level security;
alter table public.market_states enable row level security;
alter table public.market_memos enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.agent_runs enable row level security;

revoke all on function public.publish_screener_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.claim_agent_job(text) from public, anon, authenticated;
grant execute on function public.publish_screener_snapshot(uuid) to service_role;
grant execute on function public.claim_agent_job(text) to service_role;

commit;
