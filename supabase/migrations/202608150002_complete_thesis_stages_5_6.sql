begin;

-- Stage 5: capital decisions remain owner-authored and account-specific. The
-- deterministic assessment records the owner's limits and observed checks; it
-- never recommends position size or authorizes execution.
alter table public.thesis_decisions
  add column if not exists portfolio_id uuid references public.portfolios(id) on delete restrict,
  add column if not exists valuation_support text not null default '',
  add column if not exists what_changed text not null default '',
  add column if not exists change_summary jsonb not null default '[]'::jsonb,
  add column if not exists sizing_inputs jsonb,
  add column if not exists constraint_status text not null default 'needs_inputs';

alter table public.thesis_decisions
  drop constraint if exists thesis_decisions_constraint_status_check;
alter table public.thesis_decisions
  add constraint thesis_decisions_constraint_status_check
  check (constraint_status in ('pass', 'warning', 'blocked', 'needs_inputs'));

create index if not exists thesis_decisions_owner_portfolio_latest
  on public.thesis_decisions (owner_id, portfolio_id, created_at desc);

create table if not exists public.capital_decision_constraint_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  decision_id uuid not null unique references public.thesis_decisions(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete restrict,
  status text not null check (status in ('pass', 'warning', 'blocked', 'needs_inputs')),
  checks jsonb not null default '[]'::jsonb,
  inputs jsonb,
  data_as_of timestamptz not null,
  evaluated_at timestamptz not null default now()
);

create index if not exists capital_constraint_owner_portfolio_latest
  on public.capital_decision_constraint_checks (owner_id, portfolio_id, evaluated_at desc);

alter table public.capital_decision_constraint_checks enable row level security;
drop policy if exists "service role manages capital decision checks" on public.capital_decision_constraint_checks;
create policy "service role manages capital decision checks"
  on public.capital_decision_constraint_checks for all to service_role
  using (true) with check (true);

alter table public.decision_inbox_items
  drop constraint if exists decision_inbox_items_item_type_check;
alter table public.decision_inbox_items
  add constraint decision_inbox_items_item_type_check
  check (item_type in ('new_candidate', 'thesis_refresh', 'entry_zone_arrival', 'catalyst', 'kill_criterion_breach', 'decision_review_due'));

create or replace function public.record_capital_decision(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_symbol text,
  p_investment_thesis_id uuid,
  p_disposition text,
  p_formal_rating text,
  p_entry_action text,
  p_fair_value numeric,
  p_entry_zone_low numeric,
  p_entry_zone_high numeric,
  p_conviction integer,
  p_next_catalyst text,
  p_kill_criteria jsonb,
  p_rationale text,
  p_valuation_support text,
  p_what_changed text,
  p_change_summary jsonb,
  p_sizing_inputs jsonb,
  p_constraint_status text,
  p_constraint_checks jsonb,
  p_constraint_data_as_of timestamptz,
  p_price_at_decision numeric
) returns setof public.thesis_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thesis public.investment_theses%rowtype;
  v_decision public.thesis_decisions%rowtype;
  v_version integer;
begin
  if not exists (
    select 1 from public.portfolios
    where id = p_portfolio_id and owner_id = p_owner_id
  ) then raise exception 'Choose one of your portfolios'; end if;

  select * into v_thesis from public.investment_theses
  where id = p_investment_thesis_id
    and owner_id = p_owner_id
    and status = 'accepted';
  if v_thesis.id is null or upper(v_thesis.symbol) <> upper(p_symbol) then
    raise exception 'Capital decisions must be linked to the accepted thesis for this company';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || upper(p_symbol), 0));
  select coalesce(max(version), 0) + 1 into v_version
  from public.thesis_decisions where owner_id = p_owner_id and symbol = upper(p_symbol);

  insert into public.thesis_decisions (
    owner_id, portfolio_id, symbol, version, disposition, formal_rating,
    entry_action, fair_value, entry_zone_low, entry_zone_high, conviction,
    next_catalyst, kill_criteria, rationale, investment_thesis_id,
    research_note_id, price_at_decision, valuation_support, what_changed,
    change_summary, sizing_inputs, constraint_status
  ) values (
    p_owner_id, p_portfolio_id, upper(p_symbol), v_version, p_disposition,
    p_formal_rating, p_entry_action, p_fair_value, p_entry_zone_low,
    p_entry_zone_high, p_conviction, p_next_catalyst,
    coalesce(p_kill_criteria, '[]'::jsonb), p_rationale, v_thesis.id,
    v_thesis.research_note_id, p_price_at_decision, p_valuation_support,
    p_what_changed, coalesce(p_change_summary, '[]'::jsonb),
    p_sizing_inputs, p_constraint_status
  ) returning * into v_decision;

  insert into public.capital_decision_constraint_checks (
    owner_id, decision_id, portfolio_id, status, checks, inputs, data_as_of
  ) values (
    p_owner_id, v_decision.id, p_portfolio_id, p_constraint_status,
    coalesce(p_constraint_checks, '[]'::jsonb), p_sizing_inputs,
    p_constraint_data_as_of
  );

  return next v_decision;
end;
$$;

revoke all on function public.record_capital_decision(uuid,uuid,text,uuid,text,text,text,numeric,numeric,numeric,integer,text,jsonb,text,text,text,jsonb,jsonb,text,jsonb,timestamptz,numeric) from public;
grant execute on function public.record_capital_decision(uuid,uuid,text,uuid,text,text,text,numeric,numeric,numeric,integer,text,jsonb,text,text,text,jsonb,jsonb,text,jsonb,timestamptz,numeric) to service_role;

-- Stage 6: every domain activation has a durable human owner and a passed
-- admission rubric. Domain breadth follows governed economic systems, not a
-- superficial sector taxonomy.
create table if not exists public.market_domain_admission_reviews (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  pack_version integer not null check (pack_version > 0),
  reviewer_id uuid references public.market_users(id) on delete set null,
  maintenance_owner text not null check (char_length(trim(maintenance_owner)) between 3 and 160),
  decision text not null check (decision in ('admitted', 'rejected')),
  rationale text not null,
  rubric jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists domain_admission_review_latest
  on public.market_domain_admission_reviews (domain_id, created_at desc);

alter table public.market_domain_admission_reviews enable row level security;
drop policy if exists "service role manages domain admission reviews" on public.market_domain_admission_reviews;
create policy "service role manages domain admission reviews"
  on public.market_domain_admission_reviews for all to service_role
  using (true) with check (true);

insert into public.market_domain_packs (id, version, label, description, status, parent_domain_id, definition)
values
  ('healthcare-demand-reimbursement', 1, 'Healthcare demand and reimbursement', 'Clinical outcomes, diagnosis, reimbursement, manufacturing capacity, access, and durable utilization.', 'candidate', null, '{"governance":"declared_in_code","economicCaptureRequired":true}'::jsonb),
  ('consumer-commerce-platforms', 1, 'Consumer and commerce platforms', 'Household demand, traffic and retention, merchant economics, fulfillment, inventory, and pricing power.', 'candidate', null, '{"governance":"declared_in_code","economicCaptureRequired":true}'::jsonb)
on conflict (id) do nothing;

commit;
