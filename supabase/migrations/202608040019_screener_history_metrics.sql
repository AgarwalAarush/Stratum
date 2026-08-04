-- Reduce the persisted daily-bar archive to the deterministic values a live
-- screener row needs. This keeps an intraday refresh bounded even for the
-- full investable universe: the worker receives one compact metric record per
-- symbol rather than paging every historical bar back over PostgREST.

create or replace function public.screener_history_metrics(
  p_symbols text[],
  p_feed text,
  p_as_of date
)
returns table (
  symbol text,
  bar_count integer,
  average_volume numeric,
  fifty_day_average numeric,
  year_low numeric,
  year_high numeric,
  range_values numeric[],
  close_5d numeric,
  close_30d numeric,
  close_90d numeric,
  close_180d numeric,
  close_ytd numeric,
  close_1y numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select distinct unnest(p_symbols) as symbol
  ),
  eligible as (
    select bars.symbol, bars.trading_date, bars.close, bars.low, bars.high, bars.volume,
      row_number() over (partition by bars.symbol order by bars.trading_date desc) as row_number
    from public.market_bars_daily bars
    join requested on requested.symbol = bars.symbol
    where bars.feed = p_feed
      and bars.trading_date < p_as_of
  ),
  summaries as (
    select
      symbol,
      count(*)::integer as bar_count,
      avg(volume) filter (where row_number <= 20) as average_volume,
      avg(close) filter (where row_number <= 50) as fifty_day_average,
      min(low) filter (where row_number <= 252) as year_low,
      max(high) filter (where row_number <= 252) as year_high,
      array_agg(close order by trading_date) filter (where row_number <= 18) as range_values,
      max(close) filter (where row_number = 5) as close_5d,
      (array_agg(close order by abs(trading_date - (p_as_of - 30)), case when trading_date <= p_as_of - 30 then 0 else 1 end, trading_date desc)
        filter (where trading_date between p_as_of - 37 and p_as_of - 23))[1] as close_30d,
      (array_agg(close order by abs(trading_date - (p_as_of - 90)), case when trading_date <= p_as_of - 90 then 0 else 1 end, trading_date desc)
        filter (where trading_date between p_as_of - 97 and p_as_of - 83))[1] as close_90d,
      (array_agg(close order by abs(trading_date - (p_as_of - 180)), case when trading_date <= p_as_of - 180 then 0 else 1 end, trading_date desc)
        filter (where trading_date between p_as_of - 187 and p_as_of - 173))[1] as close_180d,
      (array_agg(close order by abs(trading_date - make_date(extract(year from p_as_of)::integer, 1, 1)), case when trading_date <= make_date(extract(year from p_as_of)::integer, 1, 1) then 0 else 1 end, trading_date desc)
        filter (where trading_date between make_date(extract(year from p_as_of)::integer, 1, 1) - 7 and make_date(extract(year from p_as_of)::integer, 1, 1) + 7))[1] as close_ytd,
      (array_agg(close order by abs(trading_date - (p_as_of - 365)), case when trading_date <= p_as_of - 365 then 0 else 1 end, trading_date desc)
        filter (where trading_date between p_as_of - 372 and p_as_of - 358))[1] as close_1y
    from eligible
    group by symbol
  )
  select
    requested.symbol,
    coalesce(summaries.bar_count, 0),
    summaries.average_volume,
    summaries.fifty_day_average,
    summaries.year_low,
    summaries.year_high,
    summaries.range_values,
    summaries.close_5d,
    summaries.close_30d,
    summaries.close_90d,
    summaries.close_180d,
    summaries.close_ytd,
    summaries.close_1y
  from requested
  left join summaries on summaries.symbol = requested.symbol;
$$;

grant execute on function public.screener_history_metrics(text[], text, date) to service_role;
