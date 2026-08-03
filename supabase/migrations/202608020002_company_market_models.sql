begin;

create table if not exists public.company_market_models (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_packet_id uuid not null references public.company_packets(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  content jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  error text,
  unique (owner_id, symbol, version)
);

create index if not exists company_market_models_owner_symbol_latest
  on public.company_market_models (owner_id, symbol, version desc);

alter table public.equity_research_notes
  add column if not exists company_market_model_id uuid
  references public.company_market_models(id) on delete restrict;

create index if not exists equity_research_company_market_model
  on public.equity_research_notes (company_market_model_id);

alter table public.company_market_models enable row level security;

commit;
