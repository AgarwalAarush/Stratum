begin;

alter table public.market_watchlists add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.market_watchlists add column if not exists client_id text;
alter table public.market_watchlists drop constraint if exists market_watchlists_name_key;
create unique index if not exists market_watchlists_owner_client
  on public.market_watchlists (owner_id, client_id)
  where owner_id is not null;
create index if not exists market_watchlists_owner on public.market_watchlists (owner_id);

create table if not exists public.company_packets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'complete' check (status in ('building', 'complete', 'failed')),
  packet jsonb not null,
  source_ids jsonb not null default '[]'::jsonb,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  error text,
  unique nulls not distinct (owner_id, symbol, version)
);

create index if not exists company_packets_symbol_latest on public.company_packets (symbol, generated_at desc);

create table if not exists public.equity_research_notes (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_packet_id uuid not null references public.company_packets(id) on delete restrict,
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

create index if not exists equity_research_owner_symbol_latest
  on public.equity_research_notes (owner_id, symbol, version desc);

create table if not exists public.equity_research_sources (
  research_note_id uuid not null references public.equity_research_notes(id) on delete cascade,
  source_id text not null,
  label text not null,
  url text not null,
  source text not null,
  source_as_of timestamptz not null,
  primary key (research_note_id, source_id)
);

create table if not exists public.thesis_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  disposition text not null check (disposition in ('own', 'watch', 'avoid')),
  formal_rating text not null check (formal_rating in ('BUY', 'HOLD', 'SELL', 'NOT_RATED')),
  entry_action text not null check (entry_action in ('buy_now', 'nibble', 'wait', 'add_on_weakness', 'avoid')),
  fair_value numeric,
  entry_zone_low numeric,
  entry_zone_high numeric,
  conviction integer check (conviction between 1 and 5),
  next_catalyst text,
  kill_criteria jsonb not null default '[]'::jsonb,
  rationale text not null default '',
  research_note_id uuid references public.equity_research_notes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists thesis_decisions_owner_symbol_latest
  on public.thesis_decisions (owner_id, symbol, created_at desc);

create table if not exists public.manual_positions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  shares numeric not null check (shares > 0),
  cost_basis_per_share numeric not null check (cost_basis_per_share >= 0),
  opened_at date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, symbol)
);

create table if not exists public.decision_inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('new_candidate', 'thesis_refresh', 'entry_zone_arrival', 'catalyst', 'kill_criterion_breach')),
  symbol text not null references public.market_assets(symbol) on delete cascade,
  title text not null,
  summary text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved')),
  dedupe_key text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index if not exists decision_inbox_owner_open
  on public.decision_inbox_items (owner_id, status, occurred_at desc);

alter table public.company_packets enable row level security;
alter table public.equity_research_notes enable row level security;
alter table public.equity_research_sources enable row level security;
alter table public.thesis_decisions enable row level security;
alter table public.manual_positions enable row level security;
alter table public.decision_inbox_items enable row level security;

commit;
