begin;
-- Synchronization needs the latest stored session, not 252 rows per security.
-- The production backfill hit the API statement timeout on that unused count.
-- Retain the reader shape; null means the cursor did not calculate a bar count.
create or replace function public.market_history_cursors(p_symbols text[], p_feed text)
returns table(symbol text, history_through date, bar_count integer)
language sql stable security invoker set search_path=public as $$
 select requested.symbol, bars.trading_date, case when bars.trading_date is null then 0 else null::integer end
 from (select distinct unnest(p_symbols) symbol) requested
 left join lateral (select trading_date from market_bars_daily b
   where b.symbol=requested.symbol and b.feed=p_feed order by trading_date desc limit 1) bars on true;
$$;
commit;
