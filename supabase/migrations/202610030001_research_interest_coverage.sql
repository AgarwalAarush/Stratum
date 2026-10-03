begin;
create table public.market_interest_memberships (
 owner_id uuid not null, theme text not null check (theme in ('ai','photonics','nuclear','energy','sustainable_energy','space')),
 symbol text not null references public.market_assets(symbol), version integer not null default 1,
 provenance jsonb not null, active boolean not null default true, excluded boolean not null default false,
 eligible_since timestamptz not null default now(), refreshed_at timestamptz not null default now(),
 primary key(owner_id,theme,symbol)
);
create table public.market_interest_inventories (
 owner_id uuid primary key, version integer not null default 1, content jsonb not null, refreshed_at timestamptz not null default now()
);
create table public.research_investigation_slots (
 owner_id uuid not null, investigation_date date not null, symbol text not null,
 contract_version integer not null, lane text not null check(lane in ('owned','interest','watchlist','other')),
 reservation_key text not null, job_id uuid references public.agent_jobs(id), started_at timestamptz,
 created_at timestamptz not null default now(), primary key(owner_id,investigation_date,symbol)
);
create index research_investigation_slots_job on public.research_investigation_slots(job_id);
create or replace function public.reserve_research_investigation(p_owner_id uuid,p_date date,p_symbol text,p_lane text,p_key text,p_contract integer,p_start boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_lane not in ('owned','interest','watchlist','other') or p_contract <> 2 or p_symbol !~ '^[A-Z][A-Z0-9.-]{0,11}$' then raise exception 'Invalid investigation reservation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text||p_date::text,0));
 if exists(select 1 from research_investigation_slots where owner_id=p_owner_id and investigation_date=p_date and symbol=p_symbol) then
   if p_start and exists(select 1 from research_investigation_slots where owner_id=p_owner_id and investigation_date=p_date and symbol=p_symbol and started_at is not null and reservation_key <> p_key) then return false; end if;
   if p_start then update research_investigation_slots set reservation_key=p_key,started_at=coalesce(started_at,now()) where owner_id=p_owner_id and investigation_date=p_date and symbol=p_symbol; end if;
   return true;
 end if;
 if (select count(*) from research_investigation_slots where owner_id=p_owner_id and investigation_date=p_date) >= 8 then return false; end if;
 if not p_start and p_lane='owned' and (select count(*) from research_investigation_slots where owner_id=p_owner_id and investigation_date=p_date and lane='owned') >= 6 then return false; end if;
 insert into research_investigation_slots(owner_id,investigation_date,symbol,contract_version,lane,reservation_key,started_at)
 values(p_owner_id,p_date,p_symbol,p_contract,p_lane,p_key,case when p_start then now() else null end);
 return true;
end $$;
create function public.merge_research_interest_memberships(p_owner_id uuid,p_members jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if jsonb_typeof(p_members)<>'array' or jsonb_array_length(p_members)>1000 then raise exception 'Invalid membership batch'; end if;
 insert into market_interest_memberships(owner_id,theme,symbol,version,provenance,active,refreshed_at)
 select p_owner_id,theme,symbol,version,provenance,active,refreshed_at from jsonb_to_recordset(p_members) as m(theme text,symbol text,version integer,provenance jsonb,active boolean,refreshed_at timestamptz)
 on conflict(owner_id,theme,symbol) do update set version=excluded.version,provenance=excluded.provenance,active=excluded.active,refreshed_at=excluded.refreshed_at;
 update market_interest_memberships m set active=false where owner_id=p_owner_id and not exists(select 1 from market_assets a where a.symbol=m.symbol and a.active and a.tradable);
end $$;
revoke all on function public.merge_research_interest_memberships(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.merge_research_interest_memberships(uuid,jsonb) to service_role;
alter table public.market_interest_memberships enable row level security;
alter table public.market_interest_inventories enable row level security;
alter table public.research_investigation_slots enable row level security;
revoke all on public.market_interest_memberships,public.market_interest_inventories,public.research_investigation_slots from anon,authenticated;
grant all on public.market_interest_memberships,public.market_interest_inventories,public.research_investigation_slots to service_role;
revoke all on function public.reserve_research_investigation(uuid,date,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.reserve_research_investigation(uuid,date,text,text,text,integer,boolean) to service_role;
commit;
