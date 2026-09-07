begin;
alter table public.market_assets add column if not exists alpaca_id text;
create table public.market_universe_vintages (
  id uuid primary key default gen_random_uuid(), universe text not null, symbol text not null,
  active boolean not null, source text not null, source_as_of timestamptz not null,
  observed_at timestamptz not null default now(), security_id text
);
create index on public.market_universe_vintages(universe,observed_at,symbol);
alter table public.market_universe_vintages enable row level security;
create trigger immutable_evidence before update or delete on public.market_universe_vintages for each row execute function public.reject_investment_evidence_mutation();
create or replace function public.archive_market_universe_change() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' or new.active is distinct from old.active or new.source_as_of is distinct from old.source_as_of then
    insert into market_universe_vintages(universe,symbol,active,source,source_as_of,security_id)
      select new.universe,new.symbol,new.active,new.source,new.source_as_of,alpaca_id from market_assets where symbol=new.symbol;
  end if; return new;
end; $$;
create trigger archive_market_universe_change after insert or update on public.market_universe_members for each row execute function public.archive_market_universe_change();
-- These are first-observed vintages, not reconstructed historical membership.
insert into public.market_universe_vintages(universe,symbol,active,source,source_as_of,security_id)
select m.universe,m.symbol,m.active,m.source,m.source_as_of,a.alpaca_id from public.market_universe_members m join public.market_assets a using(symbol);
create or replace function public.publish_screener_snapshot(p_snapshot_id uuid)
returns public.market_snapshots language plpgsql security definer set search_path=public as $$
declare published public.market_snapshots; actual_count integer; required_count integer; missing_count integer;
begin
  -- Serialize latest swaps and retain the last complete snapshot on failure.
  perform pg_advisory_xact_lock(hashtext('publish_screener_snapshot'));
  select count(*) into actual_count from screener_rows where snapshot_id=p_snapshot_id;
  select count(*) into required_count from market_universe_members m join market_assets a using(symbol) where m.universe='sp500' and m.active and a.active and a.tradable;
  if actual_count<450 or required_count<450 then raise exception 'Complete verified S&P 500 coverage is required'; end if;
  select count(*) into missing_count from (
    select m.symbol from market_universe_members m join market_assets a using(symbol) where m.universe='sp500' and m.active and a.active and a.tradable
    union select w.symbol from market_watchlist_items w join market_assets a using(symbol) where a.active and a.tradable
  ) required where not exists(select 1 from screener_rows r where r.snapshot_id=p_snapshot_id and r.symbol=required.symbol and r.price>0 and r.data_as_of<=now()+interval '1 minute' and r.data_as_of>=now()-interval '4 days');
  if missing_count>0 then raise exception 'Incomplete or stale required screener coverage: % names',missing_count; end if;
  update market_snapshots set is_latest=false where is_latest;
  update market_snapshots set status='complete',is_latest=true,row_count=actual_count,published_at=now(),error=null where id=p_snapshot_id and status='building' returning * into published;
  if published.id is null then raise exception 'Snapshot is missing or not building'; end if;
  return published;
end; $$;
commit;
