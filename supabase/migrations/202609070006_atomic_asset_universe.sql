begin;
create or replace function public.replace_alpaca_asset_universe(p_assets jsonb,p_as_of timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare incoming integer; existing integer;
begin
 perform pg_advisory_xact_lock(hashtext('stratum-alpaca-assets'));
 if jsonb_typeof(p_assets)<>'array' then raise exception 'Invalid asset universe'; end if;
 incoming:=jsonb_array_length(p_assets);
 select count(*) into existing from market_assets where active and tradable and source='alpaca';
 if incoming<450 or incoming<existing*0.9 then raise exception 'Incomplete asset universe; preserve prior active assets'; end if;
 if (select count(distinct a->>'symbol') from jsonb_array_elements(p_assets) a)<>incoming then raise exception 'Duplicate asset symbol'; end if;
 if exists(select 1 from market_universe_members m where m.universe='sp500' and m.active and not exists(select 1 from jsonb_array_elements(p_assets) a where a->>'symbol'=m.symbol)) then raise exception 'Asset response omits required S&P 500 member'; end if;
 if p_as_of>now()+interval '1 minute' or p_as_of<now()-interval '1 day' then raise exception 'Invalid asset capture time'; end if;
 insert into market_assets(symbol,alpaca_id,name,exchange,asset_class,status,tradable,active,source,source_as_of,raw,updated_at)
 select a->>'symbol',a->>'alpaca_id',a->>'name',a->>'exchange',a->>'asset_class','active',true,true,'alpaca',p_as_of,'{}'::jsonb,p_as_of
 from jsonb_array_elements(p_assets) a
 on conflict(symbol) do update set alpaca_id=excluded.alpaca_id,name=excluded.name,exchange=excluded.exchange,asset_class=excluded.asset_class,status='active',tradable=true,active=true,source='alpaca',source_as_of=p_as_of,updated_at=p_as_of;
 update market_assets set active=false,tradable=false,status='inactive',source_as_of=p_as_of,updated_at=p_as_of
 where source='alpaca' and active and not exists(select 1 from jsonb_array_elements(p_assets) a where a->>'symbol'=market_assets.symbol);
 return incoming;
end $$;
revoke all on function public.replace_alpaca_asset_universe(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.replace_alpaca_asset_universe(jsonb,timestamptz) to service_role;
commit;
