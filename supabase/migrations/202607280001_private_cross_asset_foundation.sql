begin;

create table if not exists public.cross_asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'building' check (status in ('building', 'complete', 'failed')),
  data_as_of timestamptz,
  retrieved_at timestamptz not null,
  observation_count integer not null default 0 check (observation_count >= 0),
  is_latest boolean not null default false,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists cross_asset_snapshots_one_latest
  on public.cross_asset_snapshots (is_latest)
  where is_latest;

create table if not exists public.cross_asset_observations (
  snapshot_id uuid not null references public.cross_asset_snapshots(id) on delete cascade,
  instrument_id text not null,
  symbol text not null,
  label text not null,
  instrument_type text not null check (
    instrument_type in (
      'equity_index',
      'volatility_index',
      'treasury_yield',
      'currency_index',
      'commodity',
      'crypto'
    )
  ),
  value numeric not null,
  previous_value numeric,
  change_percent numeric,
  unit text not null check (unit in ('index_points', 'percent', 'usd')),
  source text not null check (source in ('fmp', 'fred')),
  source_label text not null,
  source_url text not null,
  feed_timestamp timestamptz not null,
  retrieved_at timestamptz not null,
  data_status text not null check (data_status in ('real_time', 'delayed', 'end_of_day')),
  created_at timestamptz not null default now(),
  primary key (snapshot_id, instrument_id)
);

create index if not exists cross_asset_observations_instrument_time
  on public.cross_asset_observations (instrument_id, feed_timestamp desc);

create or replace function public.publish_cross_asset_snapshot(
  p_snapshot_id uuid,
  p_expected_count integer default 11
)
returns public.cross_asset_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  published public.cross_asset_snapshots;
  actual_count integer;
  actual_latest timestamptz;
begin
  select count(*), max(feed_timestamp)
    into actual_count, actual_latest
    from public.cross_asset_observations
    where snapshot_id = p_snapshot_id;

  if actual_count <> p_expected_count then
    raise exception 'Refusing to publish incomplete cross-asset snapshot: expected %, received %',
      p_expected_count, actual_count;
  end if;

  update public.cross_asset_snapshots set is_latest = false where is_latest;
  update public.cross_asset_snapshots
    set status = 'complete',
        is_latest = true,
        data_as_of = actual_latest,
        observation_count = actual_count,
        published_at = now(),
        error = null
    where id = p_snapshot_id and status = 'building'
    returning * into published;

  if published.id is null then
    raise exception 'Cross-asset snapshot is missing or is not building';
  end if;

  return published;
end;
$$;

alter table public.cross_asset_snapshots enable row level security;
alter table public.cross_asset_observations enable row level security;

revoke all on function public.publish_cross_asset_snapshot(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.publish_cross_asset_snapshot(uuid, integer)
  to service_role;

commit;
