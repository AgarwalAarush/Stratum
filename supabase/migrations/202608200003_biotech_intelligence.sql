-- Durable clinical-catalyst memory and authenticated read projection.
begin;

create table if not exists public.biotech_clinical_catalysts (
  fingerprint text primary key,
  title text not null,
  kind text not null check (kind in ('trial_result','regulatory_decision','clinical_hold','safety_signal','trial_start','medical_meeting')),
  outcome text not null check (outcome in ('positive','negative','mixed','pending','unknown')),
  significance text not null check (significance in ('urgent','investigate','monitor')),
  phase text,
  trial_id text,
  therapy text,
  indication text,
  symbols jsonb not null default '[]'::jsonb,
  materiality integer not null check (materiality between 0 and 100),
  time_sensitivity integer not null check (time_sensitivity between 0 and 100),
  economic_channels jsonb not null default '[]'::jsonb,
  decisive_new_event boolean not null default false,
  event_cluster_ids jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  next_review_at timestamptz not null,
  status text not null default 'observed' check (status in ('observed','investigating','researched','dismissed','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists biotech_clinical_catalysts_attention
  on public.biotech_clinical_catalysts (significance, materiality desc, last_observed_at desc);
create index if not exists biotech_clinical_catalysts_trial
  on public.biotech_clinical_catalysts (trial_id) where trial_id is not null;
create index if not exists biotech_clinical_catalysts_symbols
  on public.biotech_clinical_catalysts using gin (symbols);

create table if not exists public.biotech_clinical_catalyst_sources (
  catalyst_fingerprint text not null references public.biotech_clinical_catalysts(fingerprint) on delete restrict,
  source_id text not null,
  feed_item_id uuid,
  document_id uuid,
  title text not null,
  url text not null,
  publisher text not null,
  published_at timestamptz,
  fetched_at timestamptz not null,
  source_lane text not null check (source_lane in ('official_primary','global_reporting','specialist','research_data','company_disclosure','market_commentary','pr_syndication','community_discovery')),
  source_family text not null,
  source_time_anomaly boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (catalyst_fingerprint, source_id),
  check (feed_item_id is not null or document_id is not null)
);

create index if not exists biotech_clinical_catalyst_sources_feed
  on public.biotech_clinical_catalyst_sources (feed_item_id) where feed_item_id is not null;
create index if not exists biotech_clinical_catalyst_sources_event_time
  on public.biotech_clinical_catalyst_sources (published_at desc, fetched_at desc);

insert into public.world_coverage_frontiers (id, label, description, query_terms, priority)
values (
  'biotech-clinical-regulatory',
  'Biotech, clinical, and regulatory',
  'Clinical trials, regulatory decisions, safety signals, therapeutic platforms, medical meetings, and the path from evidence to commercial adoption.',
  '["Phase 3 primary endpoint", "FDA clinical hold approval", "biotech trial readout", "ASCO AACR ESMO late breaking", "ClinicalTrials.gov material update"]'::jsonb,
  82
)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  query_terms = excluded.query_terms,
  priority = excluded.priority;

alter table public.biotech_clinical_catalysts enable row level security;
alter table public.biotech_clinical_catalyst_sources enable row level security;

drop policy if exists "service role manages biotech clinical catalysts" on public.biotech_clinical_catalysts;
create policy "service role manages biotech clinical catalysts" on public.biotech_clinical_catalysts
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated users read biotech clinical catalysts" on public.biotech_clinical_catalysts;
create policy "authenticated users read biotech clinical catalysts" on public.biotech_clinical_catalysts
  for select to authenticated using (true);

drop policy if exists "service role manages biotech clinical catalyst sources" on public.biotech_clinical_catalyst_sources;
create policy "service role manages biotech clinical catalyst sources" on public.biotech_clinical_catalyst_sources
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated users read biotech clinical catalyst sources" on public.biotech_clinical_catalyst_sources;
create policy "authenticated users read biotech clinical catalyst sources" on public.biotech_clinical_catalyst_sources
  for select to authenticated using (true);

commit;
