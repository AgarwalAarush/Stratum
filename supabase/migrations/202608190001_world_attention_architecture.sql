begin;

alter table public.world_event_clusters
  add column if not exists source_lane text,
  add column if not exists attention_route text,
  add column if not exists attention_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists attention_reasons jsonb not null default '[]'::jsonb,
  add column if not exists policy_version text,
  add column if not exists triaged_at timestamptz,
  add column if not exists specialist_lenses jsonb not null default '[]'::jsonb;

alter table public.world_event_clusters drop constraint if exists world_event_clusters_processing_state_check;
alter table public.world_event_clusters add constraint world_event_clusters_processing_state_check
  check (processing_state in ('pending','processing','processed','noise','deferred','failed','quarantined'));

alter table public.world_event_clusters drop constraint if exists world_event_clusters_source_lane_check;
alter table public.world_event_clusters add constraint world_event_clusters_source_lane_check
  check (source_lane is null or source_lane in ('official_primary','global_reporting','specialist','research_data','company_disclosure','market_commentary','pr_syndication','community_discovery'));
alter table public.world_event_clusters drop constraint if exists world_event_clusters_attention_route_check;
alter table public.world_event_clusters add constraint world_event_clusters_attention_route_check
  check (attention_route is null or attention_route in ('urgent','investigate','monitor','awareness','company_only','noise'));

alter table public.world_event_cluster_sources
  add column if not exists source_lane text,
  add column if not exists source_family text;

alter table public.world_event_cluster_sources drop constraint if exists world_event_cluster_sources_lane_check;
alter table public.world_event_cluster_sources add constraint world_event_cluster_sources_lane_check
  check (source_lane is null or source_lane in ('official_primary','global_reporting','specialist','research_data','company_disclosure','market_commentary','pr_syndication','community_discovery'));

create table if not exists public.world_attention_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null check (status in ('draft','shadow','active','rejected','rolled_back')),
  policy jsonb not null,
  parent_version text,
  change_summary text not null,
  created_by uuid references public.market_users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists world_attention_one_active_policy
  on public.world_attention_policy_versions ((true)) where status = 'active';

insert into public.world_attention_policy_versions (version, status, policy, change_summary)
values (
  'attention-v1',
  'active',
  '{"laneBudgets":{"official_primary":20,"global_reporting":30,"specialist":15,"research_data":10,"company_disclosure":10,"market_commentary":5,"pr_syndication":5,"community_discovery":5},"totalModelCandidates":60,"thresholds":{"urgentMagnitude":70,"urgentTimeSensitivity":70,"minimumUrgentEvidence":50,"dependencyTransmission":60,"investigateDimension":60,"monitorDuration":55}}'::jsonb,
  'Initial recall-first attention policy approved by the owner.'
)
on conflict (version) do nothing;

create table if not exists public.world_attention_decisions (
  id uuid primary key default gen_random_uuid(),
  event_cluster_id uuid not null references public.world_event_clusters(id) on delete restrict,
  policy_version text not null,
  source_lane text not null check (source_lane in ('official_primary','global_reporting','specialist','research_data','company_disclosure','market_commentary','pr_syndication','community_discovery')),
  route text not null check (route in ('urgent','investigate','monitor','awareness','company_only','noise')),
  dimensions jsonb not null,
  reasons jsonb not null default '[]'::jsonb,
  selected_for_enrichment boolean not null default false,
  specialist_lenses jsonb not null default '[]'::jsonb,
  decided_at timestamptz not null default now(),
  unique (event_cluster_id, policy_version)
);
create index if not exists world_attention_decisions_recent on public.world_attention_decisions (decided_at desc, route);

create table if not exists public.world_signals (
  id text primary key,
  fingerprint text not null unique,
  status text not null check (status in ('observed','monitoring','activated','contradicted','superseded','dormant')),
  title text not null,
  summary text not null,
  event_cluster_ids jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  geographies jsonb not null default '[]'::jsonb,
  domains jsonb not null default '[]'::jsonb,
  economic_channels jsonb not null default '[]'::jsonb,
  activation_conditions jsonb not null default '[]'::jsonb,
  related_signal_ids jsonb not null default '[]'::jsonb,
  related_node_ids jsonb not null default '[]'::jsonb,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  last_matched_at timestamptz,
  next_review_at timestamptz not null,
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('english', search_text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists world_signals_status_review on public.world_signals (status, next_review_at);
create index if not exists world_signals_search on public.world_signals using gin (search_vector);
create index if not exists world_signals_last_observed on public.world_signals (last_observed_at desc);

create table if not exists public.world_signal_links (
  id uuid primary key default gen_random_uuid(),
  source_signal_id text not null references public.world_signals(id) on delete restrict,
  target_signal_id text not null references public.world_signals(id) on delete restrict,
  event_cluster_id uuid references public.world_event_clusters(id) on delete restrict,
  match_dimensions jsonb not null,
  rationale text not null,
  activation_satisfied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_signal_id, target_signal_id, event_cluster_id),
  check (source_signal_id <> target_signal_id)
);

create table if not exists public.world_specialist_assessments (
  id uuid primary key default gen_random_uuid(),
  thinker_run_id uuid references public.world_thinker_runs(id) on delete set null,
  event_cluster_ids jsonb not null default '[]'::jsonb,
  lens text not null check (lens in ('geopolitics_institutions','physical_economy','macro_finance','technology_industrial_capacity')),
  assessment jsonb not null,
  model_metadata jsonb not null default '{}'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists world_specialist_assessments_run on public.world_specialist_assessments (thinker_run_id, created_at);

create table if not exists public.world_policy_experiments (
  id uuid primary key default gen_random_uuid(),
  baseline_version text not null references public.world_attention_policy_versions(version) on delete restrict,
  candidate_version text not null references public.world_attention_policy_versions(version) on delete restrict,
  status text not null check (status in ('shadow','passed','failed','promoted','rolled_back')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  baseline_metrics jsonb not null default '{}'::jsonb,
  candidate_metrics jsonb not null default '{}'::jsonb,
  hard_case_regressions jsonb not null default '[]'::jsonb,
  failure_reason text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= started_at + interval '7 days')
);

create table if not exists public.world_review_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  review_week date not null,
  category text not null check (category in ('suspected_miss','false_positive','promoted_change','compound_link','coverage_problem')),
  subject_type text not null check (subject_type in ('event','signal','node','link','source','policy')),
  subject_id text not null,
  label text not null check (label in ('important','not_important','correct','incorrect','useful','not_useful','needs_followup')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, review_week, category, subject_type, subject_id)
);
create index if not exists world_review_labels_week on public.world_review_labels (owner_id, review_week desc, category);

alter table public.world_file_index drop constraint if exists world_file_index_kind_check;
alter table public.world_file_index add constraint world_file_index_kind_check
  check (kind in ('actor','situation','theme','market','scenario','hypothesis','indicator','journal','current'));

alter table public.world_attention_policy_versions enable row level security;
alter table public.world_attention_decisions enable row level security;
alter table public.world_signals enable row level security;
alter table public.world_signal_links enable row level security;
alter table public.world_specialist_assessments enable row level security;
alter table public.world_policy_experiments enable row level security;
alter table public.world_review_labels enable row level security;

create policy "service role manages world attention policies" on public.world_attention_policy_versions for all to service_role using (true) with check (true);
create policy "service role manages world attention decisions" on public.world_attention_decisions for all to service_role using (true) with check (true);
create policy "service role manages world signals" on public.world_signals for all to service_role using (true) with check (true);
create policy "service role manages world signal links" on public.world_signal_links for all to service_role using (true) with check (true);
create policy "service role manages world specialist assessments" on public.world_specialist_assessments for all to service_role using (true) with check (true);
create policy "service role manages world policy experiments" on public.world_policy_experiments for all to service_role using (true) with check (true);
create policy "service role manages world review labels" on public.world_review_labels for all to service_role using (true) with check (true);

commit;
