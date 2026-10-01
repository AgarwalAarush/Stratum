begin;
create table public.world_investigation_slots (
 day date not null, slot integer not null check(slot between 1 and 4),
 lane text not null check(lane in ('priority','exploration')),
 run_id uuid not null unique references public.world_thinker_runs(id),
 question jsonb not null, consumed_at timestamptz not null default now(),
 primary key(day,slot)
);
alter table public.world_investigation_slots enable row level security;
create or replace function public.acquire_world_investigation_slot(p_run_id uuid default null,p_question jsonb default '{}'::jsonb,p_now timestamptz default now(),p_lane text default null)
returns table(slot integer,lane text,available boolean) language plpgsql security definer set search_path=public as $$
declare d date := (p_now at time zone 'UTC')::date; s integer; l text;
begin
 perform pg_advisory_xact_lock(hashtext('stratum-world-investigation-budget'));
 if p_run_id is not null then
  return query select x.slot,x.lane,true from world_investigation_slots x where x.run_id=p_run_id;
  if found then return; end if;
 end if;
 if p_run_id is null then
  return query select n, case when mod((d-date '2026-10-01')*4+n,5)=0 then 'exploration' else 'priority' end,true
   from generate_series(1,4) n where not exists(select 1 from world_investigation_slots x where x.day=d and x.slot=n) order by n;
  return;
 end if;
 select n into s from generate_series(1,4) n where not exists(select 1 from world_investigation_slots x where x.day=d and x.slot=n)
  and (p_lane is null or p_lane=case when mod((d-date '2026-10-01')*4+n,5)=0 then 'exploration' else 'priority' end) order by n limit 1;
 if s is null then return query select null::integer,null::text,false; return; end if;
 l := case when mod((d-date '2026-10-01')*4+s,5)=0 then 'exploration' else 'priority' end;
 if p_run_id is not null then
  if p_question='{}'::jsonb then raise exception 'An investigation requires a bounded question'; end if;
  insert into world_investigation_slots(day,slot,lane,run_id,question) values(d,s,l,p_run_id,p_question);
 end if;
 return query select s,l,true;
end $$;
revoke all on function public.acquire_world_investigation_slot(uuid,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.acquire_world_investigation_slot(uuid,jsonb,timestamptz,text) to service_role;
create or replace function public.reject_legacy_belief_mutation() returns trigger language plpgsql as $$
begin raise exception 'Unsupported capability: legacy belief writer retired; use Git World investigation'; end $$;
do $$ declare t text; begin
 foreach t in array array['market_hypotheses','market_thesis_versions','market_hypothesis_research_versions','market_hypothesis_cross_domain_links'] loop
  if to_regclass('public.'||t) is not null then
   execute format('create trigger legacy_belief_authority_guard before insert or update or delete on public.%I for each row execute function public.reject_legacy_belief_mutation()',t);
  end if;
 end loop;
end $$;
commit;
