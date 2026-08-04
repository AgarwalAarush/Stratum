begin;

create table if not exists public.market_hypothesis_cross_domain_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  from_hypothesis_id uuid not null references public.market_hypotheses(id) on delete cascade,
  to_hypothesis_id uuid not null references public.market_hypotheses(id) on delete cascade,
  link_id text not null,
  relationship text not null check (relationship in ('amplifies', 'constrains', 'transmits')),
  explanation text not null,
  source_observation_ids jsonb not null default '[]'::jsonb,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  status text not null check (status in ('forming', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, from_hypothesis_id, to_hypothesis_id, link_id)
);

create index if not exists market_hypothesis_cross_domain_owner_status
  on public.market_hypothesis_cross_domain_links (owner_id, status, updated_at desc);

alter table public.market_hypothesis_cross_domain_links enable row level security;

commit;
