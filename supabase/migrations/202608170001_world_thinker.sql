begin;

create table if not exists public.world_event_clusters (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  event_at timestamptz,
  actors jsonb not null default '[]'::jsonb,
  geographies jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  claim_state text not null check (claim_state in ('reported','corroborated','officially_confirmed','contested','retracted','superseded')),
  materiality integer not null check (materiality between 0 and 100),
  novelty integer not null check (novelty between 0 and 100),
  source_diversity integer not null default 1 check (source_diversity >= 1),
  thesis_dependency boolean not null default false,
  portfolio_dependency boolean not null default false,
  decisive_new_event boolean not null default false,
  processing_state text not null default 'pending' check (processing_state in ('pending','processing','processed','noise','failed')),
  summary text not null,
  source_ids jsonb not null default '[]'::jsonb,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_event_clusters_pending
  on public.world_event_clusters (materiality desc, first_seen_at)
  where processing_state in ('pending','failed');
create index if not exists world_event_clusters_recent on public.world_event_clusters (last_seen_at desc);

create table if not exists public.world_event_cluster_sources (
  cluster_id uuid not null references public.world_event_clusters(id) on delete cascade,
  source_id text not null,
  feed_item_id uuid,
  document_id uuid,
  url text not null,
  title text not null,
  publisher text,
  published_at timestamptz,
  stance text not null default 'neutral' check (stance in ('supporting','contradicting','neutral')),
  claim_state text not null check (claim_state in ('reported','corroborated','officially_confirmed','contested','retracted','superseded')),
  created_at timestamptz not null default now(),
  primary key (cluster_id, source_id),
  check (feed_item_id is not null or document_id is not null)
);

create index if not exists world_event_cluster_sources_source on public.world_event_cluster_sources (source_id);

create table if not exists public.world_thinker_runs (
  id uuid primary key default gen_random_uuid(),
  agent_job_id uuid references public.agent_jobs(id) on delete set null,
  trigger text not null check (trigger in ('scheduled','urgent','manual','backfill','company_research')),
  status text not null default 'queued' check (status in ('queued','orienting','thinking','criticizing','revising','committed','rejected','failed','push_pending','projected')),
  checkpoint text,
  branch text not null default 'shadow/world-thinker',
  base_commit text,
  result_commit text,
  context_manifest jsonb not null default '{}'::jsonb,
  retrieval_ledger jsonb not null default '[]'::jsonb,
  critic_verdict text check (critic_verdict in ('pass','revise','reject')),
  model_metadata jsonb not null default '{}'::jsonb,
  cost_metadata jsonb not null default '{}'::jsonb,
  error text,
  push_pending boolean not null default false,
  projection_status text not null default 'pending' check (projection_status in ('pending','projected','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_thinker_runs_recent on public.world_thinker_runs (started_at desc);
create unique index if not exists world_thinker_runs_one_active
  on public.world_thinker_runs ((true)) where status in ('orienting','thinking','criticizing','revising');

create table if not exists public.world_file_index (
  commit_sha text not null,
  file_path text not null,
  node_id text not null,
  kind text not null check (kind in ('actor','situation','theme','market','scenario','hypothesis','journal','current')),
  status text not null check (status in ('active','monitoring','dormant','superseded','archived')),
  title text not null,
  as_of timestamptz not null,
  next_review_at timestamptz not null,
  confidence integer not null check (confidence between 0 and 100),
  importance integer not null check (importance between 0 and 100),
  summary text not null,
  aliases jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  structured_content jsonb not null,
  search_text text not null,
  projected_at timestamptz not null default now(),
  primary key (commit_sha, file_path)
);

create index if not exists world_file_index_current_lookup on public.world_file_index (node_id, projected_at desc);
create index if not exists world_file_index_kind_status on public.world_file_index (kind, status, importance desc);
create index if not exists world_file_index_search on public.world_file_index using gin (to_tsvector('english', search_text));

create table if not exists public.world_repository_projections (
  commit_sha text primary key,
  branch text not null,
  file_count integer not null check (file_count >= 0),
  projected_at timestamptz not null default now(),
  is_canonical boolean not null default false,
  error text
);

create unique index if not exists world_repository_one_canonical
  on public.world_repository_projections ((true)) where is_canonical;

create or replace function public.promote_world_repository_projection(p_commit_sha text)
returns public.world_repository_projections
language plpgsql
security definer
set search_path = public
as $$
declare promoted public.world_repository_projections;
begin
  perform pg_advisory_xact_lock(hashtextextended('world-repository-projection', 0));
  if not exists (select 1 from public.world_repository_projections where commit_sha = p_commit_sha) then
    raise exception 'World projection does not exist';
  end if;
  update public.world_repository_projections set is_canonical = false where is_canonical;
  update public.world_repository_projections set is_canonical = true where commit_sha = p_commit_sha returning * into promoted;
  return promoted;
end;
$$;

revoke all on function public.promote_world_repository_projection(text) from public, anon, authenticated;
grant execute on function public.promote_world_repository_projection(text) to service_role;

create table if not exists public.world_opportunity_leads (
  id text primary key,
  world_commit text not null,
  originating_node_id text not null,
  originating_hypothesis_id text not null,
  symbol text not null references public.market_assets(symbol) on delete restrict,
  issuer text not null,
  value_chain_role text not null,
  what_changed text not null,
  why_now text not null,
  transmission_mechanism text not null,
  capture_mechanism text not null,
  capture_conditions jsonb not null default '[]'::jsonb,
  supporting_source_ids jsonb not null default '[]'::jsonb,
  contradicting_source_ids jsonb not null default '[]'::jsonb,
  evidence_gaps jsonb not null default '[]'::jsonb,
  decisive_questions jsonb not null default '[]'::jsonb,
  catalysts jsonb not null default '[]'::jsonb,
  falsifiers jsonb not null default '[]'::jsonb,
  expectations_question text not null,
  materiality integer not null check (materiality between 0 and 100),
  transmission_confidence integer not null check (transmission_confidence between 0 and 100),
  capture_plausibility integer not null check (capture_plausibility between 0 and 100),
  expectations_gap integer not null check (expectations_gap between 0 and 100),
  evidence_readiness integer not null check (evidence_readiness between 0 and 100),
  portfolio_relevance integer not null check (portfolio_relevance between 0 and 100),
  investability integer not null check (investability between 0 and 100),
  decisive_new_event boolean not null default false,
  status text not null default 'new' check (status in ('new','queued','researching','researched','dismissed','expired')),
  research_job_id uuid references public.agent_jobs(id) on delete set null,
  research_note_id uuid,
  investigated_by uuid references public.market_users(id) on delete set null,
  dismissal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_opportunity_leads_queue on public.world_opportunity_leads (status, materiality desc, transmission_confidence desc);
create index if not exists world_opportunity_leads_symbol_recent on public.world_opportunity_leads (symbol, created_at desc);

alter table public.world_event_clusters enable row level security;
alter table public.world_event_cluster_sources enable row level security;
alter table public.world_thinker_runs enable row level security;
alter table public.world_file_index enable row level security;
alter table public.world_repository_projections enable row level security;
alter table public.world_opportunity_leads enable row level security;

drop policy if exists "service role manages world event clusters" on public.world_event_clusters;
create policy "service role manages world event clusters" on public.world_event_clusters for all to service_role using (true) with check (true);
drop policy if exists "service role manages world event cluster sources" on public.world_event_cluster_sources;
create policy "service role manages world event cluster sources" on public.world_event_cluster_sources for all to service_role using (true) with check (true);
drop policy if exists "service role manages world thinker runs" on public.world_thinker_runs;
create policy "service role manages world thinker runs" on public.world_thinker_runs for all to service_role using (true) with check (true);
drop policy if exists "service role manages world file index" on public.world_file_index;
create policy "service role manages world file index" on public.world_file_index for all to service_role using (true) with check (true);
drop policy if exists "service role manages world projections" on public.world_repository_projections;
create policy "service role manages world projections" on public.world_repository_projections for all to service_role using (true) with check (true);
drop policy if exists "service role manages world opportunity leads" on public.world_opportunity_leads;
create policy "service role manages world opportunity leads" on public.world_opportunity_leads for all to service_role using (true) with check (true);

commit;
