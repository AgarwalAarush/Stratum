begin;

alter table public.screener_rows
  add column if not exists sector text,
  add column if not exists sub_industry text;

create index if not exists screener_rows_snapshot_sector
  on public.screener_rows (snapshot_id, sector);

create index if not exists screener_rows_snapshot_sub_industry
  on public.screener_rows (snapshot_id, sub_industry);

comment on column public.screener_rows.sector is
  'GICS sector when a verified classification is available; otherwise Unclassified.';
comment on column public.screener_rows.sub_industry is
  'GICS sub-industry when a verified classification is available; otherwise Unclassified.';

commit;
