begin;

alter table public.world_event_clusters
  drop constraint if exists world_event_clusters_processing_state_check;

alter table public.world_event_clusters
  add constraint world_event_clusters_processing_state_check
  check (processing_state in ('pending','processing','processed','noise','failed','quarantined')),
  add column if not exists enrichment_status text not null default 'deterministic'
    check (enrichment_status in ('deterministic','enriched','fallback','failed')),
  add column if not exists processing_attempts integer not null default 0 check (processing_attempts >= 0),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_run_id uuid references public.world_thinker_runs(id) on delete set null,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists quarantined_at timestamptz;

create index if not exists world_event_clusters_retryable
  on public.world_event_clusters (next_attempt_at, materiality desc, first_seen_at)
  where processing_state in ('pending','failed');

create table if not exists public.world_coverage_frontiers (
  id text primary key,
  label text not null,
  description text not null,
  query_terms jsonb not null default '[]'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'blind_spot' check (status in ('healthy','thin','stale','blind_spot')),
  source_family_count integer not null default 0 check (source_family_count >= 0),
  active_node_ids jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  last_evidence_at timestamptz,
  last_reviewed_at timestamptz,
  last_search_at timestamptz,
  next_review_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_coverage_frontiers_due
  on public.world_coverage_frontiers (status, priority desc, next_review_at);

create table if not exists public.world_replay_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued','running','paused','completed','failed')),
  branch text not null default 'shadow/world-thinker',
  since_at timestamptz not null,
  until_at timestamptz not null,
  cursor_at timestamptz not null,
  weeks_total integer not null default 0 check (weeks_total >= 0),
  weeks_completed integer not null default 0 check (weeks_completed >= 0),
  sources_scanned integer not null default 0 check (sources_scanned >= 0),
  clusters_retained integer not null default 0 check (clusters_retained >= 0),
  search_gap_weeks integer not null default 0 check (search_gap_weeks >= 0),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cursor_at >= since_at and cursor_at <= until_at)
);

create unique index if not exists world_replay_one_active
  on public.world_replay_runs ((true)) where status in ('queued','running','paused');

create table if not exists public.world_replay_batches (
  id uuid primary key default gen_random_uuid(),
  replay_run_id uuid not null references public.world_replay_runs(id) on delete cascade,
  week_start timestamptz not null,
  week_end timestamptz not null,
  batch_index integer not null default 0 check (batch_index >= 0),
  status text not null default 'queued' check (status in ('queued','clustering','thinking','projected','fallback','quarantined','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  cluster_count integer not null default 0 check (cluster_count >= 0),
  event_cursor integer not null default 0 check (event_cursor >= 0),
  event_cluster_ids jsonb not null default '[]'::jsonb,
  thinker_run_ids jsonb not null default '[]'::jsonb,
  result_commits jsonb not null default '[]'::jsonb,
  used_deterministic_fallback boolean not null default false,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (replay_run_id, week_start, batch_index),
  check (week_end > week_start)
);

create index if not exists world_replay_batches_progress
  on public.world_replay_batches (replay_run_id, week_start, batch_index);

insert into public.world_coverage_frontiers (id, label, description, query_terms, priority)
values
  ('china-taiwan', 'China and Taiwan', 'Cross-strait security, US-China competition, industrial policy, trade, and semiconductor dependencies.', '["Taiwan Strait", "China Taiwan military", "US China export controls"]', 100),
  ('iran-middle-east', 'Iran and the Middle East', 'Iran, Israel, Gulf security, regional conflict, shipping, energy, and sanctions transmission.', '["Iran Israel Gulf security", "Red Sea shipping", "Iran sanctions energy"]', 100),
  ('russia-europe-security', 'Russia and European security', 'Russia-Ukraine conflict, NATO posture, European defense, energy, and sanctions.', '["Russia Ukraine war", "NATO Europe security", "Russia sanctions energy"]', 90),
  ('political-institutions', 'Political institutions', 'Authoritarian consolidation, democratic erosion, elections, coups, emergency powers, and civil unrest.', '["authoritarianism democratic backsliding", "emergency powers election", "coup civil unrest"]', 100),
  ('macro-sovereign', 'Macro and sovereign conditions', 'Monetary policy, fiscal capacity, sovereign credit, inflation, growth, and currency stress.', '["global monetary policy", "sovereign debt crisis", "currency inflation growth"]', 85),
  ('trade-industrial-policy', 'Trade and industrial policy', 'Tariffs, sanctions, export controls, subsidies, strategic trade, and supply-chain relocation.', '["tariffs sanctions export controls", "industrial policy subsidies", "supply chain reshoring"]', 90),
  ('energy-resources-climate', 'Energy, resources, and climate', 'Energy systems, commodities, critical materials, climate shocks, food, and water constraints.', '["energy commodities shortage", "critical minerals", "climate food water risk"]', 85),
  ('technology-industrial-capacity', 'Technology and industrial capacity', 'AI, semiconductors, cyber, power, infrastructure, manufacturing, and bottlenecks.', '["AI semiconductor cyber", "data center power", "industrial capacity bottleneck"]', 90),
  ('health-demographics-labor', 'Health, demographics, and labor', 'Public health, demographic change, migration, labor supply, and productivity.', '["public health outbreak", "demographic labor shortage", "migration workforce"]', 70),
  ('credit-liquidity-markets', 'Credit, liquidity, and markets', 'Credit conditions, banking stress, liquidity, positioning, volatility, and market structure.', '["credit conditions liquidity", "banking stress", "market positioning volatility"]', 80)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  query_terms = excluded.query_terms,
  priority = excluded.priority,
  updated_at = now();

create or replace function public.claim_world_event_clusters(
  p_run_id uuid,
  p_event_ids uuid[],
  p_lease_seconds integer default 2700
)
returns setof public.world_event_clusters
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.world_event_clusters
  set processing_state = 'processing',
      processing_attempts = processing_attempts + 1,
      last_attempt_at = now(),
      lease_run_id = p_run_id,
      lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 7200))),
      processing_error = null,
      updated_at = now()
  where id = any(p_event_ids)
    and processing_state in ('pending','failed')
    and (next_attempt_at is null or next_attempt_at <= now())
    and (lease_expires_at is null or lease_expires_at <= now())
  returning *;
end;
$$;

revoke all on function public.claim_world_event_clusters(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.claim_world_event_clusters(uuid, uuid[], integer) to service_role;

alter table public.world_coverage_frontiers enable row level security;
alter table public.world_replay_runs enable row level security;
alter table public.world_replay_batches enable row level security;

create policy "service role manages world coverage frontiers" on public.world_coverage_frontiers for all to service_role using (true) with check (true);
create policy "service role manages world replay runs" on public.world_replay_runs for all to service_role using (true) with check (true);
create policy "service role manages world replay batches" on public.world_replay_batches for all to service_role using (true) with check (true);

commit;
