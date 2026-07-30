-- Keep fixed-period screener returns populated from the already persisted,
-- feed-specific daily history. The worker remains the authoritative writer;
-- this trigger only fills values that an older worker leaves null.

create index if not exists market_bars_daily_symbol_feed_date
  on public.market_bars_daily (symbol, feed, trading_date desc);

create or replace function public.fill_screener_return_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_feed text;
  as_of_date date;
  baseline numeric;
begin
  if new.return_5d is not null
    and new.return_30d is not null
    and new.return_90d is not null
    and new.return_180d is not null
    and new.return_ytd is not null
    and new.return_1y is not null then
    return new;
  end if;

  select feed into snapshot_feed
  from public.market_snapshots
  where id = new.snapshot_id;

  if snapshot_feed is null or new.price is null or new.price = 0 then
    return new;
  end if;

  as_of_date := (new.data_as_of at time zone 'America/New_York')::date;

  if new.return_5d is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by trading_date desc
    offset 4 limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_5d := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  if new.return_30d is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by abs(trading_date - (as_of_date - 30)),
      case when trading_date <= as_of_date - 30 then 0 else 1 end,
      trading_date desc
    limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_30d := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  if new.return_90d is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by abs(trading_date - (as_of_date - 90)),
      case when trading_date <= as_of_date - 90 then 0 else 1 end,
      trading_date desc
    limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_90d := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  if new.return_180d is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by abs(trading_date - (as_of_date - 180)),
      case when trading_date <= as_of_date - 180 then 0 else 1 end,
      trading_date desc
    limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_180d := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  if new.return_ytd is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by abs(trading_date - make_date(extract(year from as_of_date)::integer, 1, 1)),
      case when trading_date <= make_date(extract(year from as_of_date)::integer, 1, 1) then 0 else 1 end,
      trading_date desc
    limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_ytd := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  if new.return_1y is null then
    select close into baseline
    from public.market_bars_daily
    where symbol = new.symbol
      and feed = snapshot_feed
      and trading_date < as_of_date
    order by abs(trading_date - (as_of_date - 365)),
      case when trading_date <= as_of_date - 365 then 0 else 1 end,
      trading_date desc
    limit 1;
    if baseline is not null and baseline <> 0 then
      new.return_1y := round(((new.price / baseline) - 1) * 100, 2);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fill_screener_return_periods_before_write on public.screener_rows;
create trigger fill_screener_return_periods_before_write
  before insert or update of price, data_as_of, return_5d, return_30d, return_90d, return_180d, return_ytd, return_1y
  on public.screener_rows
  for each row
  execute function public.fill_screener_return_periods();

-- Backfill the current published snapshot immediately. New snapshots are
-- enriched by the trigger above until every worker has the current code.
update public.screener_rows
set return_5d = null,
    return_30d = null,
    return_90d = null,
    return_180d = null,
    return_ytd = null,
    return_1y = null
where snapshot_id = (
  select id from public.market_snapshots where is_latest = true
);
