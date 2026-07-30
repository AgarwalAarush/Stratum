begin;

create table if not exists public.investment_theses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  entity_type text not null check (entity_type in ('stock', 'sub_industry')),
  entity_key text not null,
  symbol text references public.market_assets(symbol) on delete cascade,
  sector text,
  sub_industry text,
  version integer not null check (version > 0),
  status text not null check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  trigger text not null,
  content jsonb not null,
  source_refs jsonb not null default '[]'::jsonb,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  research_note_id uuid references public.equity_research_notes(id) on delete set null,
  unique (owner_id, entity_key, version),
  check ((entity_type = 'stock' and symbol is not null) or (entity_type = 'sub_industry' and sub_industry is not null))
);

create index if not exists investment_theses_owner_entity_latest
  on public.investment_theses (owner_id, entity_key, version desc);
create index if not exists investment_theses_owner_status
  on public.investment_theses (owner_id, status, generated_at desc);

alter table public.investment_theses enable row level security;

commit;
