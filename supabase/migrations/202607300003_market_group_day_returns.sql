begin;

alter table public.market_group_metrics
  add column if not exists day_return numeric;

commit;
