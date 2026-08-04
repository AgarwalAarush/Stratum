begin;

-- A capture is an append-only worker event. It records every governed fetch
-- independently of whether its bytes were new, so identical documents from a
-- retried fetch or a second allowed source never lose provenance.
create table if not exists public.world_source_document_captures (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.world_source_registry(id) on delete cascade,
  document_id uuid references public.world_documents(id) on delete restrict,
  domain_ids jsonb not null default '[]'::jsonb,
  contract_version integer not null check (contract_version > 0),
  status text not null check (status in ('captured', 'rejected', 'failed')),
  canonical_url text not null,
  resolved_url text,
  http_status integer check (http_status is null or (http_status >= 100 and http_status <= 599)),
  mime_type text,
  content_hash text,
  byte_count bigint check (byte_count is null or byte_count >= 0),
  error text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists world_source_document_captures_source_time
  on public.world_source_document_captures (source_id, captured_at desc);
create index if not exists world_source_document_captures_document_time
  on public.world_source_document_captures (document_id, captured_at desc);

alter table public.world_source_document_captures enable row level security;

commit;
