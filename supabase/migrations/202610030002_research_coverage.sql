begin;

create table if not exists public.market_research_coverage (
  owner_id uuid not null references public.market_users(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  lane text not null check (lane in ('owned', 'interest', 'rotation')),
  in_scope boolean not null default true,
  interest_tags text[] not null default '{}',
  enrolled_at timestamptz not null,
  last_meaningful_review_at timestamptz,
  research_contract_version integer not null,
  next_review_due_at timestamptz not null,
  last_selected_at timestamptz,
  last_selection_reason text,
  last_job_id uuid references public.agent_jobs(id) on delete set null,
  last_queue_status text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, symbol)
);
create index if not exists market_research_coverage_due on public.market_research_coverage(owner_id, lane, next_review_due_at);
alter table public.market_research_coverage enable row level security;
revoke all on public.market_research_coverage from anon, authenticated;
grant all on public.market_research_coverage to service_role;

create table if not exists public.market_interest_watchlist_seeds (
  owner_id uuid primary key references public.market_users(id) on delete cascade,
  seeded_at timestamptz not null default now()
);
alter table public.market_interest_watchlist_seeds enable row level security;
revoke all on public.market_interest_watchlist_seeds from anon, authenticated;
grant all on public.market_interest_watchlist_seeds to service_role;

-- One-time additive setup for the private owner's explicitly requested themes.
-- Removal/editing after setup is respected: a scheduler never resurrects a list.
create or replace function public.seed_market_interest_watchlists(p_owner_id uuid, p_lists jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_list jsonb;
  v_list_id uuid;
  v_symbol text;
begin
  if p_owner_id <> '00000000-0000-4000-8000-000000000001'::uuid then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('interest-watchlists:' || p_owner_id::text, 0));
  if exists (select 1 from market_interest_watchlist_seeds where owner_id=p_owner_id) then return false; end if;
  if jsonb_typeof(p_lists) <> 'array' then raise exception 'Interest watchlists must be an array'; end if;
  for v_list in select value from jsonb_array_elements(p_lists) loop
    insert into market_watchlists(owner_id,client_id,name)
      values(p_owner_id,v_list->>'id',v_list->>'name')
      on conflict (owner_id,client_id) where owner_id is not null do nothing;
    select id into v_list_id from market_watchlists where owner_id=p_owner_id and client_id=v_list->>'id';
    for v_symbol in select jsonb_array_elements_text(v_list->'symbols') loop
      if v_symbol !~ '^[A-Z][A-Z0-9.-]{0,11}$' then raise exception 'Invalid interest symbol'; end if;
      -- Pending catalog records carry no invented price or trading identity.
      -- The existing asset sync replaces them with verified Alpaca metadata.
      insert into market_assets(symbol,name,exchange,asset_class,status,tradable,active,source,source_as_of,raw,updated_at)
        values(v_symbol,'Watchlist coverage requested for ' || v_symbol,'unresolved','us_equity','unresolved',false,false,'watchlist-request',now(),'{"requestedBy":"interest-watchlist"}'::jsonb,now())
        on conflict(symbol) do nothing;
      insert into market_watchlist_items(watchlist_id,symbol) values(v_list_id,v_symbol) on conflict do nothing;
    end loop;
  end loop;
  insert into market_interest_watchlist_seeds(owner_id) values(p_owner_id);
  return true;
end;
$$;
revoke all on function public.seed_market_interest_watchlists(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.seed_market_interest_watchlists(uuid,jsonb) to service_role;

commit;
