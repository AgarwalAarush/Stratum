begin;

-- Review outcomes are an append-only decision ledger. A company thesis can be
-- credible while the owner deliberately takes no capital action, so that
-- conclusion must not be collapsed into either rejection or silent inaction.
create table if not exists public.investment_thesis_review_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  investment_thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  decision text not null check (decision in ('accept', 'reject', 'revise', 'no_trade')),
  rationale text not null check (char_length(btrim(rationale)) between 3 and 2000),
  reviewed_at timestamptz not null default now(),
  unique (investment_thesis_id)
);

create index if not exists investment_thesis_review_outcomes_owner_recent
  on public.investment_thesis_review_outcomes (owner_id, reviewed_at desc);

alter table public.investment_thesis_review_outcomes enable row level security;

-- `accept` and `no_trade` both validate a durable belief and turn on the
-- monitor. `no_trade` records an intentionally absent capital action. `revise`
-- preserves the proposal as superseded, leaving the next research version to
-- create a new proposal instead of overwriting this one.
drop function if exists public.review_investment_thesis(uuid, uuid, text);

create function public.review_investment_thesis(
  p_owner_id uuid,
  p_thesis_id uuid,
  p_decision text,
  p_rationale text
)
returns public.investment_theses
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.investment_theses;
  reviewed public.investment_theses;
  review_time timestamptz := now();
  monitor_coverage jsonb;
begin
  if p_decision not in ('accept', 'reject', 'revise', 'no_trade') then
    raise exception 'Unsupported thesis review decision';
  end if;
  if char_length(btrim(coalesce(p_rationale, ''))) < 3 then
    raise exception 'A review rationale is required';
  end if;

  select * into proposal
  from public.investment_theses
  where id = p_thesis_id
    and owner_id = p_owner_id
    and status = 'proposed'
  for update;

  if proposal.id is null then
    raise exception 'Thesis proposal not found';
  end if;

  if p_decision in ('accept', 'no_trade') then
    update public.investment_theses
    set status = 'superseded', reviewed_at = review_time
    where owner_id = p_owner_id
      and entity_key = proposal.entity_key
      and status = 'accepted';
  end if;

  update public.investment_theses
  set status = case
        when p_decision in ('accept', 'no_trade') then 'accepted'
        when p_decision = 'reject' then 'rejected'
        else 'superseded'
      end,
      reviewed_at = review_time
  where id = p_thesis_id
  returning * into reviewed;

  insert into public.investment_thesis_review_outcomes (
    owner_id, investment_thesis_id, decision, rationale, reviewed_at
  ) values (
    p_owner_id, proposal.id, p_decision, btrim(p_rationale), review_time
  );

  if p_decision in ('accept', 'no_trade') then
    monitor_coverage := case
      when proposal.entity_type = 'stock'
        then '["price", "material_events", "research"]'::jsonb
      else '["leadership", "candidate_scout"]'::jsonb
    end;

    insert into public.thesis_monitors (
      owner_id, thesis_id, entity_key, status, coverage, last_outcome, updated_at
    ) values (
      p_owner_id, proposal.id, proposal.entity_key, 'active', monitor_coverage,
      'pending', review_time
    ) on conflict (owner_id, entity_key) do update
    set thesis_id = excluded.thesis_id,
        status = 'active',
        coverage = excluded.coverage,
        last_outcome = 'pending',
        last_error = null,
        failure_count = 0,
        updated_at = excluded.updated_at;
  end if;

  return reviewed;
end;
$$;

revoke all on function public.review_investment_thesis(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_investment_thesis(uuid, uuid, text, text) to service_role;

commit;
