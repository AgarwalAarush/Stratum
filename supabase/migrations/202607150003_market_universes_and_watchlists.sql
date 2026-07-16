begin;

create table if not exists public.market_universe_members (
  universe text not null,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  source text not null,
  source_as_of timestamptz not null,
  active boolean not null default true,
  refreshed_at timestamptz not null default now(),
  primary key (universe, symbol)
);

create index if not exists market_universe_members_active
  on public.market_universe_members (universe, active, symbol);

create table if not exists public.market_watchlists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_watchlist_items (
  watchlist_id uuid not null references public.market_watchlists(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, symbol)
);

insert into public.market_watchlists (name)
values ('Primary')
on conflict (name) do nothing;

create or replace function public.replace_market_universe(
  p_universe text,
  p_symbols text[],
  p_source text,
  p_source_as_of timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  if cardinality(p_symbols) < 450 then
    raise exception 'Refusing to publish a market universe with fewer than 450 members';
  end if;

  update public.market_universe_members
    set active = false, refreshed_at = now()
    where universe = p_universe;

  insert into public.market_universe_members (
    universe, symbol, source, source_as_of, active, refreshed_at
  )
  select p_universe, symbol, p_source, p_source_as_of, true, now()
  from unnest(p_symbols) as symbol
  on conflict (universe, symbol) do update
    set source = excluded.source,
        source_as_of = excluded.source_as_of,
        active = true,
        refreshed_at = now();

  select count(*) into member_count
  from public.market_universe_members
  where universe = p_universe and active;
  return member_count;
end;
$$;

alter table public.market_universe_members enable row level security;
alter table public.market_watchlists enable row level security;
alter table public.market_watchlist_items enable row level security;

revoke all on function public.replace_market_universe(text, text[], text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_market_universe(text, text[], text, timestamptz)
  to service_role;

commit;
