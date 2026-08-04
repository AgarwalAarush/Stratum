begin;

-- Domain packs are declarative economic systems. They permit broad expansion
-- without treating a classifier label as a trusted causal model.
create table if not exists public.market_domain_packs (
  id text primary key,
  version integer not null check (version > 0),
  label text not null,
  description text not null,
  status text not null check (status in ('candidate', 'active', 'archived')),
  parent_domain_id text references public.market_domain_packs(id) on delete set null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.world_source_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  status text not null check (status in ('running', 'complete', 'failed')),
  trigger text not null check (trigger in ('bootstrap', 'frontier_gap', 'coverage_review', 'manual')),
  reason text not null,
  candidates jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  requested_at timestamptz not null default now(),
  generated_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists world_source_discovery_runs_domain_created
  on public.world_source_discovery_runs (domain_id, created_at desc);

create table if not exists public.world_source_registry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null,
  publisher text not null,
  canonical_url text not null,
  source_tier text not null check (source_tier in ('primary', 'regulatory', 'independent', 'discovery')),
  source_kind text not null check (source_kind in ('api', 'rss', 'html', 'pdf', 'dataset', 'filing', 'transcript')),
  status text not null check (status in ('candidate', 'probation', 'approved', 'blocked', 'retired')),
  evidence_classes jsonb not null default '[]'::jsonb,
  discovered_by text not null check (discovered_by in ('seed', 'scout', 'user')),
  discovery_run_id uuid references public.world_source_discovery_runs(id) on delete set null,
  approved_at timestamptz,
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_source_registry_status on public.world_source_registry (status, updated_at desc);
create index if not exists world_source_registry_publisher on public.world_source_registry (publisher);

create table if not exists public.world_source_contract_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.world_source_registry(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'retired')),
  allowed_hosts jsonb not null default '[]'::jsonb,
  allowed_paths jsonb not null default '[]'::jsonb,
  accepted_mime_types jsonb not null default '[]'::jsonb,
  cadence text not null check (cadence in ('event', 'daily', 'weekly', 'monthly')),
  assertions_allowed jsonb not null default '[]'::jsonb,
  retention_days integer check (retention_days is null or retention_days > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (source_id, version)
);

create unique index if not exists world_source_contract_one_active
  on public.world_source_contract_versions (source_id) where status = 'active';

create table if not exists public.world_source_domains (
  source_id uuid not null references public.world_source_registry(id) on delete cascade,
  domain_id text not null references public.market_domain_packs(id) on delete cascade,
  role text not null check (role in ('core', 'corroborating', 'discovery')),
  primary key (source_id, domain_id)
);

create index if not exists world_source_domains_domain on public.world_source_domains (domain_id, role);

-- New governed documents retain a direct source identity. Legacy documents
-- remain readable so the migration does not rewrite historical evidence.
alter table public.world_documents
  add column if not exists source_registry_id uuid references public.world_source_registry(id) on delete set null;
create index if not exists world_documents_source_registry_time
  on public.world_documents (source_registry_id, ingested_at desc);

insert into public.market_domain_packs (id, version, label, description, status, parent_domain_id, definition)
values
  ('ai-power', 1, 'AI infrastructure and power', 'Data-center load, firm capacity, interconnection, electrical equipment, and regional scarcity.', 'active', null,
   '{"mechanisms":["data_center_load","firm_capacity_constraint","interconnection_constraint","equipment_lead_time","economic_capture"],"sourceRequirements":["regulatory_data","operational_data","company_disclosure","industry_research"]}'::jsonb),
  ('semicap-data-center-equipment', 1, 'Semicap and data-center equipment', 'Compute, networking, cooling, memory, fabrication capacity, and equipment bottlenecks.', 'candidate', 'ai-power',
   '{"mechanisms":["compute_demand","fabrication_capacity","component_lead_time","supply_chain_capture"],"sourceRequirements":["company_disclosure","technical_research","industry_research"]}'::jsonb),
  ('critical-materials', 1, 'Critical materials and supply chains', 'Mine supply, processing concentration, inventories, export controls, substitution, and project lead times.', 'candidate', null,
   '{"mechanisms":["resource_supply","processing_concentration","trade_constraint","substitution"],"sourceRequirements":["regulatory_data","operational_data","company_disclosure"]}'::jsonb),
  ('macro-policy-geopolitics', 1, 'Macro, policy, and geopolitics', 'Rates, fiscal policy, trade rules, security constraints, and geopolitical transmission channels.', 'candidate', null,
   '{"mechanisms":["policy_change","financial_conditions","supply_chain_disruption","expectations_shift"],"sourceRequirements":["regulatory_data","operational_data","market_expectations"]}'::jsonb)
on conflict (id) do nothing;

-- Existing AI/power sources are explicitly grandfathered through the same
-- contract system. Future scout output starts as candidate and cannot ingest.
insert into public.world_source_registry (slug, label, publisher, canonical_url, source_tier, source_kind, status, evidence_classes, discovered_by, approved_at)
values
  ('eia', 'U.S. Energy Information Administration', 'U.S. Energy Information Administration', 'https://www.eia.gov/', 'regulatory', 'html', 'approved', '["regulatory_data"]'::jsonb, 'seed', now()),
  ('ferc', 'Federal Energy Regulatory Commission', 'Federal Energy Regulatory Commission', 'https://www.ferc.gov/', 'regulatory', 'pdf', 'approved', '["regulatory_data"]'::jsonb, 'seed', now()),
  ('doe', 'U.S. Department of Energy', 'U.S. Department of Energy', 'https://www.energy.gov/', 'regulatory', 'html', 'approved', '["regulatory_data","industry_research"]'::jsonb, 'seed', now()),
  ('nerc', 'North American Electric Reliability Corporation', 'North American Electric Reliability Corporation', 'https://www.nerc.com/', 'independent', 'pdf', 'approved', '["industry_research","operational_data"]'::jsonb, 'seed', now())
on conflict (slug) do nothing;

insert into public.world_source_contract_versions (source_id, version, status, allowed_hosts, allowed_paths, accepted_mime_types, cadence, assertions_allowed, retention_days, notes)
select id, 1, 'active',
  case slug
    when 'eia' then '["eia.gov"]'::jsonb
    when 'ferc' then '["ferc.gov"]'::jsonb
    when 'doe' then '["energy.gov"]'::jsonb
    when 'nerc' then '["nerc.com"]'::jsonb
  end,
  '[]'::jsonb,
  case slug
    when 'ferc' then '["application/pdf","text/html"]'::jsonb
    when 'nerc' then '["application/pdf","text/html"]'::jsonb
    else '["text/html","application/pdf"]'::jsonb
  end,
  'daily', '["fact","estimate","claim"]'::jsonb, null,
  'Seeded legacy source contract; revisions must be additive and auditable.'
from public.world_source_registry
where slug in ('eia', 'ferc', 'doe', 'nerc')
on conflict (source_id, version) do nothing;

insert into public.world_source_domains (source_id, domain_id, role)
select id, 'ai-power', 'core'
from public.world_source_registry
where slug in ('eia', 'ferc', 'doe', 'nerc')
on conflict (source_id, domain_id) do nothing;

-- The active contract changes atomically with approval. Callers validate the
-- individual fields before this RPC; the function supplies locking, versioning,
-- and the one-active-contract invariant.
create or replace function public.activate_world_source_contract(
  p_source_id uuid,
  p_allowed_hosts jsonb,
  p_allowed_paths jsonb,
  p_accepted_mime_types jsonb,
  p_cadence text,
  p_assertions_allowed jsonb,
  p_retention_days integer,
  p_notes text,
  p_approval_reason text
)
returns public.world_source_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  current_source public.world_source_registry;
  next_version integer;
  published_source public.world_source_registry;
begin
  select * into current_source from public.world_source_registry where id = p_source_id for update;
  if current_source.id is null then raise exception 'Unknown source'; end if;
  if current_source.status in ('blocked', 'retired') then raise exception 'Source cannot be approved from %', current_source.status; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.world_source_contract_versions where source_id = p_source_id;
  update public.world_source_contract_versions set status = 'retired' where source_id = p_source_id and status = 'active';
  insert into public.world_source_contract_versions (
    source_id, version, status, allowed_hosts, allowed_paths, accepted_mime_types, cadence, assertions_allowed, retention_days, notes
  ) values (
    p_source_id, next_version, 'active', p_allowed_hosts, p_allowed_paths, p_accepted_mime_types, p_cadence, p_assertions_allowed, p_retention_days, p_notes
  );
  update public.world_source_registry
  set status = 'approved', approved_at = now(), blocked_reason = null,
      metadata = metadata || jsonb_build_object('approvalReason', p_approval_reason, 'approvedContractVersion', next_version),
      updated_at = now()
  where id = p_source_id
  returning * into published_source;
  return published_source;
end;
$$;

revoke all on function public.activate_world_source_contract(uuid, jsonb, jsonb, jsonb, text, jsonb, integer, text, text) from public, anon, authenticated;
grant execute on function public.activate_world_source_contract(uuid, jsonb, jsonb, jsonb, text, jsonb, integer, text, text) to service_role;

alter table public.market_domain_packs enable row level security;
alter table public.world_source_discovery_runs enable row level security;
alter table public.world_source_registry enable row level security;
alter table public.world_source_contract_versions enable row level security;
alter table public.world_source_domains enable row level security;

commit;
