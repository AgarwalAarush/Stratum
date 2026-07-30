begin;

create table if not exists public.thesis_monitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  entity_key text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  coverage jsonb not null default '[]'::jsonb,
  last_state jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_evidence_at timestamptz,
  last_outcome text not null default 'pending' check (last_outcome in ('pending', 'no_change', 'attention', 'refresh_queued', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, entity_key)
);

create index if not exists thesis_monitors_active
  on public.thesis_monitors (status, last_checked_at nulls first)
  where status = 'active';

create table if not exists public.thesis_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.thesis_monitors(id) on delete cascade,
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  owner_id uuid not null references public.market_users(id) on delete cascade,
  data_fingerprint text not null,
  outcome text not null check (outcome in ('attention', 'refresh_queued', 'failed')),
  reason_codes text[] not null default '{}',
  findings jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  error text,
  unique (monitor_id, data_fingerprint)
);

create index if not exists thesis_monitor_runs_owner_recent
  on public.thesis_monitor_runs (owner_id, evaluated_at desc);

alter table public.decision_inbox_items
  alter column symbol drop not null;
alter table public.decision_inbox_items
  add column if not exists investment_thesis_id uuid references public.investment_theses(id) on delete set null,
  add column if not exists thesis_monitor_id uuid references public.thesis_monitors(id) on delete set null,
  add column if not exists entity_key text,
  add column if not exists severity text not null default 'attention'
    check (severity in ('information', 'attention', 'urgent'));

create index if not exists decision_inbox_thesis_open
  on public.decision_inbox_items (owner_id, investment_thesis_id, status, occurred_at desc);

alter table public.thesis_monitors enable row level security;
alter table public.thesis_monitor_runs enable row level security;

create or replace function public.review_investment_thesis(
  p_owner_id uuid,
  p_thesis_id uuid,
  p_decision text
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
  if p_decision not in ('accept', 'reject') then
    raise exception 'Unsupported thesis review decision';
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

  if p_decision = 'accept' then
    update public.investment_theses
    set status = 'superseded', reviewed_at = review_time
    where owner_id = p_owner_id
      and entity_key = proposal.entity_key
      and status = 'accepted';
  end if;

  update public.investment_theses
  set status = case when p_decision = 'accept' then 'accepted' else 'rejected' end,
      reviewed_at = review_time
  where id = p_thesis_id
  returning * into reviewed;

  if p_decision = 'accept' then
    monitor_coverage := case
      when proposal.entity_type = 'stock'
        then '["price", "material_events", "research"]'::jsonb
      else '["leadership", "candidate_scout"]'::jsonb
    end;

    insert into public.thesis_monitors (
      owner_id,
      thesis_id,
      entity_key,
      status,
      coverage,
      last_outcome,
      updated_at
    )
    values (
      p_owner_id,
      p_thesis_id,
      proposal.entity_key,
      'active',
      monitor_coverage,
      'pending',
      review_time
    )
    on conflict (owner_id, entity_key) do update
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

revoke all on function public.review_investment_thesis(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_investment_thesis(uuid, uuid, text) to service_role;

commit;
