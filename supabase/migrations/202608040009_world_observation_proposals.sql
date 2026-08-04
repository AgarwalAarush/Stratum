begin;

-- Model-extracted text remains a proposal, never market-model evidence. Each
-- row is tied to one immutable capture and one exact source document; review
-- can add a separate decision record without rewriting the extraction.
create table if not exists public.world_observation_proposals (
  id uuid primary key default gen_random_uuid(),
  source_capture_id uuid not null references public.world_source_document_captures(id) on delete restrict,
  document_id uuid not null references public.world_documents(id) on delete restrict,
  source_id uuid not null references public.world_source_registry(id) on delete restrict,
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  mechanism text not null,
  assertion text not null,
  observation_kind text not null check (observation_kind in ('fact', 'estimate', 'claim', 'inference')),
  evidence_quote text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  materiality numeric not null check (materiality >= 0 and materiality <= 100),
  novelty numeric not null check (novelty >= 0 and novelty <= 100),
  fingerprint text not null unique,
  provider text,
  model text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists world_observation_proposals_capture_time
  on public.world_observation_proposals (source_capture_id, generated_at desc);
create index if not exists world_observation_proposals_domain_time
  on public.world_observation_proposals (domain_id, generated_at desc);

alter table public.world_observation_proposals enable row level security;

commit;
