begin;

-- Broad research is a durable lead dossier, deliberately separate from the
-- governed recurring-source registry. A lead may inform what to investigate,
-- including counter-evidence, but cannot enter a market observation, baseline,
-- hypothesis, or recommendation without independent governed evidence.
create table if not exists public.market_research_scout_runs (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  status text not null check (status in ('running', 'complete', 'failed')),
  trigger text not null check (trigger in ('frontier_gap', 'manual')),
  reason text not null,
  frontier_ids uuid[] not null default '{}',
  leads jsonb not null default '[]'::jsonb,
  unresolved_questions jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  requested_at timestamptz not null default now(),
  generated_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists market_research_scout_runs_domain_created
  on public.market_research_scout_runs (domain_id, created_at desc);

alter table public.market_research_scout_runs enable row level security;
create policy "authenticated read market research scout runs" on public.market_research_scout_runs
  for select to authenticated using (true);
create policy "service role manages market research scout runs" on public.market_research_scout_runs
  for all to service_role using (true) with check (true);

commit;
