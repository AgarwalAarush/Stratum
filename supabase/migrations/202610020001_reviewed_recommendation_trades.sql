begin;
-- A confirmed report appends the ledger and its recommendation outcome atomically.
-- Broker snapshots remain authoritative; this records an owner report, never an order.
create or replace function public.record_reviewed_recommendation_trade(
 p_owner_id uuid,p_recommendation_id uuid,p_request_id uuid,p_trade jsonb,p_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare r recommendation_versions; p portfolios; tx uuid; side text; shares numeric; price numeric; fee numeric; held numeric; cash numeric; c portfolio_confirmations; updated jsonb; positions jsonb; prior_basis numeric; new_shares numeric; cash_change numeric;
begin
 select * into strict r from recommendation_versions where id=p_recommendation_id and owner_id=p_owner_id;
 select * into strict p from portfolios where id=r.portfolio_id and owner_id=p_owner_id for update;
 select (details->>'transactionId')::uuid into tx from recommendation_owner_events where owner_id=p_owner_id and request_id=p_request_id and recommendation_id=r.id;
 if tx is not null then return tx; end if;
 side:=p_trade->>'action'; shares:=(p_trade->>'quantity')::numeric; price:=(p_trade->>'pricePerShare')::numeric; fee:=(p_trade->>'fees')::numeric;
 if side not in ('buy','sell') or p_trade->>'symbol'<>r.symbol or shares is null or shares<=0 or price is null or price<=0 or fee is null or fee<0 or length(p_trade->>'notes')<8 then raise exception 'Invalid completed trade'; end if;
 if p_occurred_at<r.issued_at or p_occurred_at>now()+interval '1 minute' or (p_trade->>'occurredAt')::date<>(p_occurred_at at time zone 'America/New_York')::date then raise exception 'Invalid fill time'; end if;
 if p.kind='manual' then
   select * into c from portfolio_confirmations where portfolio_id=p.id and owner_id=p_owner_id order by confirmed_at desc limit 1;
   if c.id is not null then
     if exists(select 1 from portfolio_transactions where portfolio_id=p.id and created_at>c.confirmed_at) then raise exception 'Unreconciled manual snapshot'; end if;
     if p_occurred_at<c.as_of then raise exception 'Fill predates the current manual snapshot'; end if;
     select coalesce((value->>'quantity')::numeric,0),(value->>'costBasisPerShare')::numeric into held,prior_basis from jsonb_array_elements(c.content->'positions') where value->>'symbol'=r.symbol;
     held:=coalesce(held,0); cash:=(c.content->>'cash')::numeric;
   else
   select coalesce(sum(case when action in ('buy','position_import') then quantity when action='sell' then -quantity else 0 end),0) into held from portfolio_transactions where portfolio_id=p.id and symbol=r.symbol and voided_at is null;
   if side='sell' and shares>held then raise exception 'Reported sale exceeds the holding'; end if;
   select p.initial_funds+coalesce(sum(case when action='cash_deposit' then price_per_share when action='cash_withdrawal' then -price_per_share when action='buy' then -quantity*price_per_share-fees when action='sell' then quantity*price_per_share-fees else 0 end),0) into cash from portfolio_transactions where portfolio_id=p.id and voided_at is null;
   end if;
   if side='sell' and shares>held then raise exception 'Reported sale exceeds the holding'; end if;
   if p_trade ? 'previousQuantity' and (p_trade->>'previousQuantity')::numeric<>held then raise exception 'Holding changed. Review again'; end if;
   if p_trade ? 'previousCash' and (p_trade->>'previousCash')::numeric<>cash then raise exception 'Cash changed. Review again'; end if;
   if side='buy' and shares*price+fee>cash then raise exception 'Reported purchase exceeds recorded cash'; end if;
 end if;
 insert into portfolio_transactions(owner_id,portfolio_id,action,symbol,quantity,price_per_share,fees,occurred_at,notes,source,external_key)
 values(p_owner_id,p.id,side,r.symbol,shares,price,fee,(p_trade->>'occurredAt')::date,p_trade->>'notes','natural_language','recommendation:'||p_request_id) returning id into tx;
 insert into recommendation_owner_events(owner_id,recommendation_id,request_id,event_type,rationale,details,occurred_at)
 values(p_owner_id,r.id,p_request_id,'manually_executed',p_trade->>'notes',jsonb_build_object('side',side,'quantity',shares,'price',price,'fees',fee,'transactionId',tx,'provenance','owner_report','brokerReconciliationPending',p.kind='brokerage'),p_occurred_at);
 if p.kind='manual' and c.id is not null then
   new_shares:=held+case when side='buy' then shares else -shares end;
   cash_change:=case when side='buy' then -shares*price-fee else shares*price-fee end;
   select coalesce(jsonb_agg(value),'[]'::jsonb) into positions from jsonb_array_elements(c.content->'positions') where value->>'symbol'<>r.symbol;
   if new_shares>0 then positions:=positions||jsonb_build_array(jsonb_build_object('symbol',r.symbol,'quantity',new_shares,'costBasisPerShare',case when side='buy' then (held*coalesce(prior_basis,0)+shares*price+fee)/new_shares else prior_basis end)); end if;
   updated:=c.content||jsonb_build_object('positions',positions,'cash',cash+cash_change,'lastReportedTrade',tx);
   if updated ? 'allocationBudget' then
     updated:=jsonb_set(updated,'{allocationBudget,holdingsValue}',to_jsonb(greatest(0,(updated->'allocationBudget'->>'total')::numeric-cash-cash_change)));
   end if;
   insert into portfolio_confirmations(owner_id,portfolio_id,request_id,as_of,content,content_hash)
   values(p_owner_id,p.id,p_request_id,c.as_of,updated,encode(sha256(convert_to(updated::text,'UTF8')),'hex'));
 end if;
 return tx;
end; $$;
revoke all on function public.record_reviewed_recommendation_trade(uuid,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.record_reviewed_recommendation_trade(uuid,uuid,uuid,jsonb,timestamptz) to service_role;
commit;
