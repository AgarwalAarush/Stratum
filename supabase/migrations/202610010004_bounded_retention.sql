begin;
create function public.prune_market_snapshot_slice(p_before timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target uuid; deleted integer; removed boolean:=false;
begin
 perform set_config('statement_timeout','20s',true);
 select s.id into target from market_snapshots s where not s.is_latest and s.created_at<p_before
 and not exists(select 1 from market_states st join market_memos m on m.market_state_id=st.id where st.snapshot_id=s.id)
 order by s.created_at,s.id for update skip locked limit 1;
 if target is null then return jsonb_build_object('deleted',0,'removed',false,'more',false); end if;
 delete from screener_rows where snapshot_id=target and symbol in (select symbol from screener_rows where snapshot_id=target order by symbol limit 1000);
 get diagnostics deleted=row_count;
 if not exists(select 1 from screener_rows where snapshot_id=target) then
  delete from market_snapshots where id=target and not is_latest;
  removed:=found;
 end if;
 return jsonb_build_object('deleted',deleted,'removed',removed,'more',true);
end $$;
revoke all on function public.prune_market_snapshot_slice(timestamptz) from public,anon,authenticated;
grant execute on function public.prune_market_snapshot_slice(timestamptz) to service_role;
commit;
