begin;
alter table public.recommendation_evaluation_tasks add column checkpoint_date date;
alter table public.recommendation_evaluation_tasks add column retrospective boolean not null default false;
alter table public.recommendation_evaluation_tasks add column evaluator_version text;
alter table public.recommendation_evaluations drop constraint recommendation_evaluations_kind_check;
alter table public.recommendation_evaluations add constraint recommendation_evaluations_kind_check check(kind in ('markout','aging','thesis','attribution'));
create function public.recommendation_checkpoint_date(p_issued timestamptz,p_horizon text) returns date
language sql immutable set search_path=public as $$
 select case p_horizon
 when '1w' then (p_issued at time zone 'America/New_York')::date+7
 when '2w' then (p_issued at time zone 'America/New_York')::date+14
 when '1m' then ((p_issued at time zone 'America/New_York')::date+interval '1 month')::date
 when '2m' then ((p_issued at time zone 'America/New_York')::date+interval '2 months')::date
 when '3m' then ((p_issued at time zone 'America/New_York')::date+interval '3 months')::date
 when '6m' then ((p_issued at time zone 'America/New_York')::date+interval '6 months')::date
 when '1y' then ((p_issued at time zone 'America/New_York')::date+interval '1 year')::date end
$$;
create function public.schedule_recommendation_aging() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before,checkpoint_date,evaluator_version)
 select new.owner_id,new.id,'aging',h,
   (recommendation_checkpoint_date(new.issued_at,h)::text||' 22:00:00+00')::timestamptz,
   recommendation_checkpoint_date(new.issued_at,h),'calendar-aging-v1'
 from unnest(array['1w','2w','1m','2m','3m','6m','1y']) h
 on conflict(recommendation_id,kind,horizon) do nothing;
 return new;
end; $$;
create trigger schedule_aging after insert on public.recommendation_versions for each row execute function public.schedule_recommendation_aging();
-- Historical task semantics are preserved. These new schedules are retrospective,
-- never prospective efficacy evidence. Issued recommendation versions remain immutable.
insert into public.recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before,checkpoint_date,retrospective,evaluator_version)
select r.owner_id,r.id,'aging',h,(recommendation_checkpoint_date(r.issued_at,h)::text||' 22:00:00+00')::timestamptz,recommendation_checkpoint_date(r.issued_at,h),true,'calendar-aging-v1'
from public.recommendation_versions r cross join unnest(array['1w','2w','1m','2m','3m','6m','1y']) h
on conflict(recommendation_id,kind,horizon) do nothing;
revoke all on function public.schedule_recommendation_aging() from public,anon,authenticated;
create or replace function public.publish_recommendation_batch(p_manifest_id uuid, p_recommendations jsonb, p_metadata jsonb, p_summary text)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.recommendation_input_manifests; b uuid; r jsonb; n jsonb; f jsonb; rid uuid; previous public.recommendation_versions; episode text; ordinal integer; h integer;
begin
  select * into strict m from recommendation_input_manifests where id=p_manifest_id for update;
  select id into b from recommendation_batches where manifest_id=m.id;
  if b is not null then return b; end if;
  if jsonb_typeof(p_recommendations)<>'array' or jsonb_array_length(p_recommendations)<>jsonb_array_length(m.content->'names') then raise exception 'Incomplete daily coverage'; end if;
  insert into recommendation_batches(owner_id,manifest_id,decision_date,policy_version,model_metadata,summary,coverage)
    values(m.owner_id,m.id,m.decision_date,m.policy_version,p_metadata,p_summary,jsonb_build_object('required',jsonb_array_length(m.content->'names'),'published',jsonb_array_length(p_recommendations),'gaps',m.content->'gaps')) returning id into b;
  for r in select * from jsonb_array_elements(p_recommendations) loop
    select value into n from jsonb_array_elements(m.content->'names') where value->>'symbol'=r->>'symbol' and value->>'portfolioId'=r->>'portfolioId';
    if n is null then raise exception 'Name outside frozen context'; end if;
    if exists(select 1 from jsonb_array_elements_text(r->'sourceIds') s where not exists(select 1 from jsonb_array_elements(m.content->'evidence') e where e->>'id'=s.value and (e->>'availableAt')::timestamptz <= m.decision_cutoff)) then raise exception 'Unknown or future evidence'; end if;
    if r->>'action' in ('buy','add','hold','trim','sell') and (jsonb_array_length(r->'gateReasons')>0 or (r->>'expiresAt')::timestamptz <= now()) then raise exception 'Blocked or expired recommendation'; end if;
    episode := concat(r->>'portfolioId',':',n->>'securityId',':',coalesce(n->'thesis'->>'id','unestablished'));
    select * into previous from recommendation_versions where owner_id=m.owner_id and episode_id=episode order by version desc limit 1;
    insert into recommendation_versions(owner_id,batch_id,episode_id,version,supersedes_id,portfolio_id,security_id,symbol,action,content)
      values(m.owner_id,b,episode,coalesce(previous.version,0)+1,previous.id,(r->>'portfolioId')::uuid,n->>'securityId',r->>'symbol',r->>'action',r) returning id into rid;
    ordinal:=0;
    for f in select * from jsonb_array_elements(r->'forecasts') loop
      insert into recommendation_forecasts(owner_id,recommendation_id,ordinal,deadline,probability,content) values(m.owner_id,rid,ordinal,(f->>'deadline')::timestamptz,(f->>'probability')::numeric,f);
      ordinal:=ordinal+1;
    end loop;
    insert into recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before) select m.owner_id,rid,'thesis',rf.ordinal::text,rf.deadline from recommendation_forecasts rf where rf.recommendation_id=rid;
  end loop;
  return b;
end; $$;
revoke all on function public.publish_recommendation_batch(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.publish_recommendation_batch(uuid,jsonb,jsonb,text) to service_role;

commit;
