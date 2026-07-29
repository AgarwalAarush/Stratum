begin;

create table if not exists public.market_leadership_snapshots (
  id uuid primary key default gen_random_uuid(),
  trading_date date not null,
  status text not null default 'building' check (status in ('building', 'complete', 'failed')),
  data_as_of timestamptz not null,
  universe_count integer not null,
  usable_count integer not null default 0,
  fresh_count integer not null default 0,
  advancing_percent numeric,
  above_50_day_percent numeric,
  is_latest boolean not null default false,
  error text,
  generated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists market_leadership_one_latest
  on public.market_leadership_snapshots (is_latest)
  where is_latest;

create unique index if not exists market_leadership_one_date_complete
  on public.market_leadership_snapshots (trading_date)
  where status = 'complete';

create table if not exists public.market_stock_metrics (
  snapshot_id uuid not null references public.market_leadership_snapshots(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  company text not null,
  sector text not null,
  sub_industry text not null,
  price numeric not null,
  day_return numeric,
  return_30d numeric,
  return_50d numeric,
  return_200d numeric,
  return_1y numeric,
  vs_50_day_average numeric,
  vs_200_day_average numeric,
  relative_volume numeric,
  observation_count integer not null,
  data_as_of timestamptz not null,
  primary key (snapshot_id, symbol)
);

create table if not exists public.market_group_metrics (
  snapshot_id uuid not null references public.market_leadership_snapshots(id) on delete cascade,
  group_type text not null check (group_type in ('sector', 'sub_industry')),
  label text not null,
  sector text not null default '',
  constituent_count integer not null,
  return_30d numeric,
  return_50d numeric,
  return_200d numeric,
  return_1y numeric,
  vs_50_day_average numeric,
  vs_200_day_average numeric,
  primary key (snapshot_id, group_type, sector, label)
);

create table if not exists public.market_divergence_signals (
  snapshot_id uuid not null references public.market_leadership_snapshots(id) on delete cascade,
  signal_id text not null,
  scope text not null check (scope in ('stock_vs_group', 'near_vs_long_term')),
  symbol text,
  group_label text not null,
  near_term_return numeric not null,
  long_term_return numeric not null,
  spread numeric not null,
  summary text not null,
  primary key (snapshot_id, signal_id)
);

create table if not exists public.candidate_briefs (
  id text primary key,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  leadership_snapshot_id uuid not null references public.market_leadership_snapshots(id) on delete cascade,
  trading_date date not null,
  company text not null,
  sector text not null,
  sub_industry text not null,
  why_surfaced text not null,
  content jsonb not null,
  status text not null default 'new' check (status in ('new', 'dismissed', 'snoozed', 'watchlisted', 'promoted')),
  owner_id uuid references auth.users(id) on delete cascade,
  snoozed_until date,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists candidate_briefs_trading_date on public.candidate_briefs (trading_date desc);
create index if not exists candidate_briefs_symbol_date on public.candidate_briefs (symbol, trading_date desc);

create table if not exists public.candidate_signals (
  candidate_id text not null references public.candidate_briefs(id) on delete cascade,
  kind text not null,
  summary text not null,
  material_key text not null,
  primary key (candidate_id, kind, material_key)
);

create or replace function public.publish_market_leadership_snapshot(p_snapshot_id uuid)
returns public.market_leadership_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  published public.market_leadership_snapshots;
  stock_count integer;
  group_count integer;
begin
  select count(*) into stock_count from public.market_stock_metrics where snapshot_id = p_snapshot_id;
  select count(*) into group_count from public.market_group_metrics where snapshot_id = p_snapshot_id;
  if stock_count < 450 or group_count = 0 then
    raise exception 'Cannot publish incomplete leadership snapshot: % stocks, % groups', stock_count, group_count;
  end if;

  update public.market_leadership_snapshots set is_latest = false where is_latest;
  update public.market_leadership_snapshots
    set status = 'complete', is_latest = true, usable_count = stock_count, published_at = now(), error = null
    where id = p_snapshot_id and status = 'building'
    returning * into published;

  if published.id is null then
    raise exception 'Leadership snapshot is missing or is not building';
  end if;
  return published;
end;
$$;

alter table public.market_leadership_snapshots enable row level security;
alter table public.market_stock_metrics enable row level security;
alter table public.market_group_metrics enable row level security;
alter table public.market_divergence_signals enable row level security;
alter table public.candidate_briefs enable row level security;
alter table public.candidate_signals enable row level security;

revoke all on function public.publish_market_leadership_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.publish_market_leadership_snapshot(uuid) to service_role;

commit;
