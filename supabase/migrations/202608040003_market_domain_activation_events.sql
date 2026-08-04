begin;

create table if not exists public.market_domain_pack_events (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  action text not null check (action in ('activated', 'archived')),
  reason text not null,
  source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_domain_pack_events_domain_created
  on public.market_domain_pack_events (domain_id, created_at desc);

alter table public.market_domain_pack_events enable row level security;

commit;
