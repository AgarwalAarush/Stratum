-- Fixed-period returns are materialized with each immutable screener snapshot.
-- This keeps filtering and sorting independent of provider requests and page views.
alter table public.screener_rows
  add column if not exists return_5d numeric,
  add column if not exists return_30d numeric,
  add column if not exists return_90d numeric,
  add column if not exists return_180d numeric,
  add column if not exists return_ytd numeric,
  add column if not exists return_1y numeric;

create index if not exists screener_rows_snapshot_return_30d
  on public.screener_rows (snapshot_id, return_30d desc);
