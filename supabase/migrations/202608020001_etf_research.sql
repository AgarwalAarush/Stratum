begin;

create table if not exists public.etf_research_packets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'complete' check (status in ('building', 'complete', 'failed')),
  packet jsonb not null,
  source_ids jsonb not null default '[]'::jsonb,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  error text,
  unique (owner_id, symbol, version)
);

create index if not exists etf_research_packets_owner_symbol_latest
  on public.etf_research_packets (owner_id, symbol, version desc);

create table if not exists public.etf_research_notes (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  etf_research_packet_id uuid not null references public.etf_research_packets(id) on delete restrict,
  previous_research_note_id uuid references public.etf_research_notes(id) on delete set null,
  version integer not null check (version > 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed')),
  formal_rating text not null default 'NOT_RATED' check (formal_rating in ('BUY', 'HOLD', 'SELL', 'NOT_RATED')),
  entry_action text not null default 'wait' check (entry_action in ('buy_now', 'nibble', 'wait', 'add_on_weakness', 'avoid')),
  content jsonb,
  provider text,
  model text,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  error text,
  unique (owner_id, symbol, version)
);

create index if not exists etf_research_notes_owner_symbol_latest
  on public.etf_research_notes (owner_id, symbol, version desc);

create table if not exists public.etf_research_sources (
  research_note_id uuid not null references public.etf_research_notes(id) on delete cascade,
  source_id text not null,
  label text not null,
  url text not null,
  source text not null,
  source_as_of timestamptz not null,
  primary key (research_note_id, source_id)
);

alter table public.etf_research_packets enable row level security;
alter table public.etf_research_notes enable row level security;
alter table public.etf_research_sources enable row level security;

commit;
