begin;

-- Only one complete leadership snapshot is retained per trading date. A retry
-- after a successful close must reuse that snapshot instead of failing on the
-- partial unique index and leaving the home page without a current artifact.
create or replace function public.publish_market_leadership_snapshot(p_snapshot_id uuid)
returns public.market_leadership_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.market_leadership_snapshots;
  existing_snapshot public.market_leadership_snapshots;
  published public.market_leadership_snapshots;
  stock_count integer;
  group_count integer;
begin
  select * into candidate
    from public.market_leadership_snapshots
    where id = p_snapshot_id and status = 'building'
    for update;
  if candidate.id is null then
    raise exception 'Leadership snapshot is missing or is not building';
  end if;

  -- Serializes same-day retries without blocking different trading dates.
  perform pg_advisory_xact_lock(hashtext('market-leadership:' || candidate.trading_date::text));

  select * into existing_snapshot
    from public.market_leadership_snapshots
    where trading_date = candidate.trading_date
      and status = 'complete'
      and id <> candidate.id
    for update;
  if existing_snapshot.id is not null then
    delete from public.market_leadership_snapshots where id = candidate.id;
    return existing_snapshot;
  end if;

  select count(*) into stock_count from public.market_stock_metrics where snapshot_id = p_snapshot_id;
  select count(*) into group_count from public.market_group_metrics where snapshot_id = p_snapshot_id;
  if stock_count < 450 or group_count = 0 then
    raise exception 'Cannot publish incomplete leadership snapshot: % stocks, % groups', stock_count, group_count;
  end if;

  update public.market_leadership_snapshots set is_latest = false where is_latest;
  update public.market_leadership_snapshots
    set status = 'complete', is_latest = true, usable_count = stock_count, published_at = now(), error = null
    where id = p_snapshot_id
    returning * into published;
  return published;
end;
$$;

revoke all on function public.publish_market_leadership_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.publish_market_leadership_snapshot(uuid) to service_role;

commit;
