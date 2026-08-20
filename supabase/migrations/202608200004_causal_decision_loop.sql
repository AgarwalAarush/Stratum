begin;

-- A committed World change is a durable outbox record. Git remains the readable
-- source of synthesized World state; this table makes the downstream projection
-- and event checkpoint recovery explicit instead of inferring it from two stores.
create table if not exists public.world_change_sets (
  id uuid primary key default gen_random_uuid(),
  commit_sha text not null unique,
  thinker_run_id uuid references public.world_thinker_runs(id) on delete set null,
  branch text not null,
  is_canonical boolean not null default false,
  projection_status text not null default 'pending' check (projection_status in ('pending','projected','failed')),
  lead_status text not null default 'pending' check (lead_status in ('pending','projected','failed')),
  checkpoint_status text not null default 'pending' check (checkpoint_status in ('pending','advanced','failed')),
  event_cluster_ids jsonb not null default '[]'::jsonb,
  error text,
  committed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_change_sets_recovery
  on public.world_change_sets (projection_status, checkpoint_status, committed_at desc);

-- This is the common, read-only causal contract. It deliberately does not merge
-- World nodes and legacy thesis records; consumers get one consistent semantic
-- shape while each originating system keeps its own evidence and lifecycle.
create table if not exists public.causal_model_versions (
  id uuid primary key default gen_random_uuid(),
  causal_key text not null,
  source_kind text not null check (source_kind in ('world_node','market_thesis')),
  source_id text not null,
  source_version text not null,
  source_commit text,
  state text not null check (state in ('active','monitoring','weakened','invalidated','archived','shadow')),
  title text not null,
  summary text not null,
  mechanism text,
  economic_variable text,
  constrained_layer text,
  rent_recipient text,
  expectations_question text,
  confidence integer not null check (confidence between 0 and 100),
  importance integer not null check (importance between 0 and 100),
  source_ids jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  freshness jsonb not null default '{}'::jsonb,
  structured_content jsonb not null default '{}'::jsonb,
  as_of timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source_kind, source_id, source_version)
);

create index if not exists causal_model_versions_current
  on public.causal_model_versions (causal_key, as_of desc);
create index if not exists causal_model_versions_active
  on public.causal_model_versions (state, importance desc, as_of desc);

-- One open item per subject prevents scheduled refreshes from replacing an
-- unreviewed decision with more prose. New evidence is appended as a delta.
create table if not exists public.owner_review_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  causal_model_version_id uuid references public.causal_model_versions(id) on delete set null,
  world_opportunity_lead_id text references public.world_opportunity_leads(id) on delete set null,
  subject_type text not null check (subject_type in ('world_change','market_thesis','company_investigation','prediction')),
  subject_id text not null,
  decision_type text not null check (decision_type in ('review_world_change','investigate_company','review_thesis','evaluate_prediction')),
  title text not null,
  what_changed text not null,
  why_now text not null,
  if_ignored text not null,
  attention_minutes integer not null check (attention_minutes between 1 and 60),
  priority integer not null check (priority between 0 and 100),
  status text not null default 'pending' check (status in ('pending','in_review','investigate','accepted','rejected','no_trade','revised','deferred','superseded','expired')),
  delta jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  owner_rationale text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owner_review_items_one_open_subject
  on public.owner_review_items (owner_id, subject_type, subject_id)
  where status in ('pending','in_review','deferred');
create index if not exists owner_review_items_owner_queue
  on public.owner_review_items (owner_id, status, priority desc, updated_at desc);

alter table public.world_thinker_runs
  drop constraint if exists world_thinker_runs_status_check;
alter table public.world_thinker_runs
  add constraint world_thinker_runs_status_check
  check (status in ('queued','orienting','thinking','criticizing','revising','committed','rejected','failed','noop','push_pending','projected'));
alter table public.world_thinker_runs
  add column if not exists outcome_reason text;

alter table public.world_change_sets enable row level security;
alter table public.causal_model_versions enable row level security;
alter table public.owner_review_items enable row level security;

drop policy if exists "service role manages world change sets" on public.world_change_sets;
create policy "service role manages world change sets" on public.world_change_sets for all to service_role using (true) with check (true);
drop policy if exists "service role manages causal model versions" on public.causal_model_versions;
create policy "service role manages causal model versions" on public.causal_model_versions for all to service_role using (true) with check (true);
drop policy if exists "service role manages owner review items" on public.owner_review_items;
create policy "service role manages owner review items" on public.owner_review_items for all to service_role using (true) with check (true);

commit;
