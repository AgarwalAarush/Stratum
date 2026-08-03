begin;

create table if not exists public.world_documents (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  canonical_url text not null,
  title text not null,
  publisher text not null,
  source_tier text not null check (source_tier in ('primary', 'regulatory', 'independent', 'discovery')),
  mime_type text not null default 'text/plain',
  archive_key text,
  extracted_key text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'complete', 'failed')),
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  backup_state text not null default 'not_configured' check (backup_state in ('pending', 'verified', 'failed', 'not_configured')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists world_documents_published_at on public.world_documents (published_at desc);
create index if not exists world_documents_source_tier on public.world_documents (source_tier, ingested_at desc);

create table if not exists public.world_entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('company', 'technology', 'facility', 'commodity', 'jurisdiction', 'regulator', 'industry', 'dataset')),
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, canonical_name)
);

create table if not exists public.world_observations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.world_documents(id) on delete restrict,
  assertion text not null,
  observation_kind text not null check (observation_kind in ('fact', 'estimate', 'claim', 'inference')),
  domain text not null,
  mechanism text not null,
  geography text,
  numeric_value numeric,
  numeric_unit text,
  valid_from timestamptz,
  valid_to timestamptz,
  observed_at timestamptz,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  materiality numeric not null check (materiality >= 0 and materiality <= 100),
  novelty numeric not null check (novelty >= 0 and novelty <= 100),
  decay_hours integer check (decay_hours is null or decay_hours > 0),
  supersedes_id uuid references public.world_observations(id) on delete set null,
  fingerprint text not null unique,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists world_observations_domain_time on public.world_observations (domain, ingested_at desc);
create index if not exists world_observations_mechanism_time on public.world_observations (mechanism, ingested_at desc);
create index if not exists world_observations_material on public.world_observations (materiality desc, ingested_at desc);

create table if not exists public.world_observation_entities (
  observation_id uuid not null references public.world_observations(id) on delete cascade,
  entity_id uuid not null references public.world_entities(id) on delete restrict,
  primary key (observation_id, entity_id)
);

create table if not exists public.world_relationships (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references public.world_entities(id) on delete restrict,
  to_entity_id uuid not null references public.world_entities(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('requires', 'supplies', 'constrains', 'substitutes_for', 'benefits_from', 'operates')),
  evidence_observation_id uuid references public.world_observations(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence numeric not null default 50 check (confidence >= 0 and confidence <= 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists world_relationships_from on public.world_relationships (from_entity_id, relationship_type);
create index if not exists world_relationships_to on public.world_relationships (to_entity_id, relationship_type);

create table if not exists public.world_baselines (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'domain', 'industry', 'entity')),
  scope_key text not null,
  version integer not null check (version > 0),
  content jsonb not null,
  markdown text not null,
  observation_ids jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  diff jsonb not null default '[]'::jsonb,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  freshness text not null check (freshness in ('fresh', 'aging', 'stale')),
  unique (scope_type, scope_key, version)
);

create index if not exists world_baselines_latest on public.world_baselines (scope_type, scope_key, version desc);

create table if not exists public.market_hypotheses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  title text not null,
  status text not null check (status in ('dormant', 'forming', 'proposed', 'active', 'rejected', 'archived')),
  scope text not null,
  horizon text not null,
  core_mechanism text not null,
  causal_graph jsonb not null default '[]'::jsonb,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  unresolved_nodes jsonb not null default '[]'::jsonb,
  counter_thesis text not null,
  parent_hypothesis_id uuid references public.market_hypotheses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_hypotheses_owner_status on public.market_hypotheses (owner_id, status, updated_at desc);

create table if not exists public.market_hypothesis_evidence (
  hypothesis_id uuid not null references public.market_hypotheses(id) on delete cascade,
  observation_id uuid not null references public.world_observations(id) on delete restrict,
  role text not null check (role in ('supporting', 'contradicting')),
  causal_node text not null,
  weight numeric not null check (weight >= 0 and weight <= 100),
  explanation text not null,
  primary key (hypothesis_id, observation_id, causal_node)
);

create table if not exists public.market_thesis_versions (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.market_hypotheses(id) on delete restrict,
  version integer not null check (version > 0),
  state text not null check (state in ('active', 'weakened', 'invalidated', 'archived')),
  title text not null,
  content jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  revision_diff jsonb not null default '[]'::jsonb,
  unique (hypothesis_id, version)
);

create index if not exists market_thesis_versions_latest on public.market_thesis_versions (hypothesis_id, version desc);

create table if not exists public.market_thesis_predictions (
  id uuid primary key default gen_random_uuid(),
  market_thesis_version_id uuid not null references public.market_thesis_versions(id) on delete cascade,
  prediction text not null,
  expected_direction text not null,
  deadline timestamptz,
  evidence_needed text not null,
  result text not null default 'pending' check (result in ('pending', 'confirmed', 'disconfirmed', 'expired')),
  evaluated_at timestamptz
);

create table if not exists public.market_thesis_exposures (
  id uuid primary key default gen_random_uuid(),
  market_thesis_version_id uuid not null references public.market_thesis_versions(id) on delete cascade,
  value_chain_layer text not null,
  entity_name text not null,
  symbol text references public.market_assets(symbol) on delete set null,
  role text not null check (role in ('beneficiary', 'loser', 'substitute')),
  mechanism text not null,
  materiality numeric not null check (materiality >= 0 and materiality <= 100),
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  verification_status text not null check (verification_status in ('verified', 'needs_company_research', 'unverified'))
);

create table if not exists public.market_thesis_company_links (
  market_thesis_version_id uuid not null references public.market_thesis_versions(id) on delete cascade,
  investment_thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  primary key (market_thesis_version_id, investment_thesis_id)
);

create table if not exists public.market_corpus_backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('backup', 'verify', 'restore_drill')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  snapshot_id text,
  byte_count bigint,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.world_documents enable row level security;
alter table public.world_entities enable row level security;
alter table public.world_observations enable row level security;
alter table public.world_observation_entities enable row level security;
alter table public.world_relationships enable row level security;
alter table public.world_baselines enable row level security;
alter table public.market_hypotheses enable row level security;
alter table public.market_hypothesis_evidence enable row level security;
alter table public.market_thesis_versions enable row level security;
alter table public.market_thesis_predictions enable row level security;
alter table public.market_thesis_exposures enable row level security;
alter table public.market_thesis_company_links enable row level security;
alter table public.market_corpus_backup_runs enable row level security;

commit;
