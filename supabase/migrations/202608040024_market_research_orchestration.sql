begin;

create table if not exists public.market_orchestration_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'complete', 'failed')),
  trigger text not null check (trigger in ('scheduled', 'manual')),
  market_regime text,
  input_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create table if not exists public.market_orchestration_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.market_orchestration_runs(id) on delete cascade,
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  action_type text not null check (action_type in ('investigate_broad', 'verify_recurring_source', 'critic_revision', 'collect_known_source', 'awaiting_review', 'no_action')),
  state text not null check (state in ('planned', 'enqueued', 'awaiting_review', 'no_action', 'skipped', 'failed')),
  priority integer not null check (priority >= 0 and priority <= 1000),
  rationale text not null,
  deterministic_signals jsonb not null default '{}'::jsonb,
  job_type text,
  job_id uuid references public.agent_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists market_orchestration_actions_domain_created
  on public.market_orchestration_actions (domain_id, created_at desc);
create index if not exists market_orchestration_actions_run_priority
  on public.market_orchestration_actions (run_id, priority, created_at);

alter table public.market_orchestration_runs enable row level security;
alter table public.market_orchestration_actions enable row level security;
create policy "authenticated read market orchestration runs" on public.market_orchestration_runs for select to authenticated using (true);
create policy "authenticated read market orchestration actions" on public.market_orchestration_actions for select to authenticated using (true);
create policy "service role manages market orchestration runs" on public.market_orchestration_runs for all to service_role using (true) with check (true);
create policy "service role manages market orchestration actions" on public.market_orchestration_actions for all to service_role using (true) with check (true);

commit;
