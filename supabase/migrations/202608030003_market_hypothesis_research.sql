begin;

-- A hypothesis is a live correlation object. These rows preserve the analytical
-- work performed on it, including incomplete and rejected work, so that new
-- evidence can be compared with—not silently replace—prior reasoning.
create table if not exists public.market_hypothesis_research_versions (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.market_hypotheses(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('running', 'complete', 'needs_revision', 'failed')),
  content jsonb not null default '{}'::jsonb,
  critique jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  observation_ids jsonb not null default '[]'::jsonb,
  prior_research_version_id uuid references public.market_hypothesis_research_versions(id) on delete set null,
  revision_diff jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  data_as_of timestamptz not null,
  generated_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (hypothesis_id, version)
);

create index if not exists market_hypothesis_research_latest
  on public.market_hypothesis_research_versions (hypothesis_id, version desc);

-- Open questions are durable work, not prompt text. An executor may only work
-- through a declared source adapter; unavailable source classes remain visible
-- as blocked rather than triggering an unrestricted internet search.
create table if not exists public.market_hypothesis_research_frontier (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.market_hypotheses(id) on delete cascade,
  research_version_id uuid references public.market_hypothesis_research_versions(id) on delete set null,
  question text not null,
  causal_node text not null,
  priority integer not null check (priority >= 1 and priority <= 5),
  source_types jsonb not null default '[]'::jsonb,
  adapter_id text,
  status text not null check (status in ('queued', 'complete', 'blocked', 'deferred')),
  evidence_needed text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_hypothesis_research_frontier_queue
  on public.market_hypothesis_research_frontier (status, priority desc, next_run_at asc);

-- A published thesis is a projection of a specific analytical revision. This
-- makes a later change inspectable instead of silently replacing the market
-- model that originally supported an investment-research lead.
alter table public.market_thesis_versions
  add column if not exists research_version_id uuid references public.market_hypothesis_research_versions(id) on delete set null;

create index if not exists market_thesis_versions_research_version
  on public.market_thesis_versions (research_version_id);

alter table public.market_hypothesis_research_versions enable row level security;
alter table public.market_hypothesis_research_frontier enable row level security;

commit;
