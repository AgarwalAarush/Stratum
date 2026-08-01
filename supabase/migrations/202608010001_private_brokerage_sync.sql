begin;

-- Private, immutable reconciliation snapshots. These records are deliberately
-- separate from the user-entered transaction ledger: the broker is truth for
-- current Personal-account balances, while the ledger remains the reviewable
-- history for manual portfolios and annotations.
create table if not exists public.brokerage_sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  provider text not null check (provider in ('robinhood')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  slot text check (slot in ('open', 'midday', 'close', 'final')),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  captured_at timestamptz,
  completed_at timestamptz,
  position_count integer not null default 0 check (position_count >= 0),
  source_metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists brokerage_sync_runs_portfolio_latest
  on public.brokerage_sync_runs (portfolio_id, status, captured_at desc);

create table if not exists public.brokerage_account_snapshots (
  sync_run_id uuid primary key references public.brokerage_sync_runs(id) on delete cascade,
  cash_balance numeric not null,
  equity_value numeric not null,
  total_value numeric not null,
  buying_power numeric,
  currency text not null default 'USD' check (char_length(currency) = 3),
  created_at timestamptz not null default now()
);

create table if not exists public.brokerage_position_snapshots (
  sync_run_id uuid not null references public.brokerage_sync_runs(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  quantity numeric not null check (quantity > 0),
  cost_basis_per_share numeric not null check (cost_basis_per_share >= 0),
  current_price numeric,
  quote_as_of timestamptz,
  quote_source text not null default 'robinhood_mcp' check (quote_source in ('robinhood_mcp')),
  created_at timestamptz not null default now(),
  primary key (sync_run_id, symbol),
  check ((current_price is null and quote_as_of is null) or (current_price >= 0 and quote_as_of is not null))
);

create index if not exists brokerage_position_snapshots_symbol
  on public.brokerage_position_snapshots (symbol);

alter table public.brokerage_sync_runs enable row level security;
alter table public.brokerage_account_snapshots enable row level security;
alter table public.brokerage_position_snapshots enable row level security;

commit;
