begin;

-- Worker-owned reachability and contract-shape telemetry. A failed probe is
-- evidence for review, never an automatic source block or admission decision.
create table if not exists public.world_source_health_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.world_source_registry(id) on delete cascade,
  status text not null check (status in ('healthy', 'degraded', 'failed')),
  canonical_url text not null,
  resolved_url text,
  http_status integer check (http_status is null or (http_status >= 100 and http_status <= 599)),
  mime_type text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error text,
  checked_at timestamptz not null default now()
);

create index if not exists world_source_health_checks_source_checked
  on public.world_source_health_checks (source_id, checked_at desc);

create index if not exists world_source_health_checks_status_checked
  on public.world_source_health_checks (status, checked_at desc);

alter table public.world_source_health_checks enable row level security;

commit;
