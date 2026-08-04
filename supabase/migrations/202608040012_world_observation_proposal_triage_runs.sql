begin;

-- Triage attempts are immutable operational evidence. A rejected model output
-- must be visible without turning the source capture itself into a failure.
create table if not exists public.world_observation_proposal_triage_runs (
  id uuid primary key default gen_random_uuid(),
  source_capture_id uuid not null references public.world_source_document_captures(id) on delete restrict,
  status text not null check (status in ('succeeded', 'failed', 'skipped')),
  proposal_count integer not null default 0 check (proposal_count >= 0),
  provider text,
  model text,
  error text,
  completed_at timestamptz not null default now()
);

create index if not exists world_observation_proposal_triage_runs_capture_time
  on public.world_observation_proposal_triage_runs (source_capture_id, completed_at desc);

alter table public.world_observation_proposal_triage_runs enable row level security;

commit;
