create table if not exists public.world_benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  event_cluster_id uuid not null unique references public.world_event_clusters(id) on delete restrict,
  family text not null,
  title text not null,
  materiality integer not null check (materiality between 0 and 100),
  official_primary boolean not null default false,
  source_ids jsonb not null default '[]'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  observed_route text not null check (observed_route in ('urgent','investigate','monitor','awareness','company_only','noise')),
  observed_specialist_lenses jsonb not null default '[]'::jsonb,
  expected_route text check (expected_route is null or expected_route in ('urgent','investigate','monitor','awareness','company_only','noise')),
  expected_primary_lens text check (expected_primary_lens is null or expected_primary_lens in ('geopolitics_institutions','physical_economy','macro_finance','technology_industrial_capacity')),
  hard_case boolean not null default false,
  status text not null default 'pending_owner_review' check (status in ('pending_owner_review','confirmed','rejected')),
  owner_notes text,
  labeled_by uuid references public.market_users(id) on delete set null,
  labeled_at timestamptz,
  as_of timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'confirmed' or expected_route is not null)
);
create index if not exists world_benchmark_cases_review on public.world_benchmark_cases (status, hard_case desc, materiality desc);

create table if not exists public.world_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null,
  status text not null check (status in ('completed','insufficient_labels','failed')),
  case_count integer not null default 0 check (case_count >= 0),
  metrics jsonb not null default '{}'::jsonb,
  hard_case_regressions jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.world_benchmark_results (
  benchmark_run_id uuid not null references public.world_benchmark_runs(id) on delete cascade,
  benchmark_case_id uuid not null references public.world_benchmark_cases(id) on delete restrict,
  actual_route text,
  actual_specialist_lenses jsonb not null default '[]'::jsonb,
  route_correct boolean not null,
  specialist_correct boolean,
  passed boolean not null,
  created_at timestamptz not null default now(),
  primary key (benchmark_run_id, benchmark_case_id)
);

alter table public.world_benchmark_cases enable row level security;
alter table public.world_benchmark_runs enable row level security;
alter table public.world_benchmark_results enable row level security;
create policy "service role manages world benchmark cases" on public.world_benchmark_cases for all to service_role using (true) with check (true);
create policy "service role manages world benchmark runs" on public.world_benchmark_runs for all to service_role using (true) with check (true);
create policy "service role manages world benchmark results" on public.world_benchmark_results for all to service_role using (true) with check (true);

comment on table public.world_benchmark_cases is 'Owner-labeled benchmark cases backed by real event clusters and exact source lineage; no synthetic prompt variations.';

alter table public.world_thinker_runs
  add column if not exists opportunity_lead_count integer not null default 0 check (opportunity_lead_count >= 0),
  add column if not exists research_queued_count integer not null default 0 check (research_queued_count >= 0);
