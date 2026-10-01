begin;
alter table public.overviews add column artifact_metadata jsonb;
create table public.intelligence_generation_attempts (
 id uuid primary key default gen_random_uuid(), type text not null,
 readiness text not null check(readiness in ('complete','partial','blocked','failed')),
 metadata jsonb not null, created_at timestamptz not null default now()
);
create index on public.intelligence_generation_attempts(type,created_at desc);
alter table public.intelligence_generation_attempts enable row level security;
commit;
