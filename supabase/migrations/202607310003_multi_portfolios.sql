begin;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('brokerage', 'manual')),
  initial_funds numeric not null default 0 check (initial_funds >= 0),
  started_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  action text not null check (action in ('cash_deposit', 'cash_withdrawal', 'buy', 'sell', 'position_import')),
  symbol text,
  quantity numeric,
  price_per_share numeric not null check (price_per_share > 0),
  fees numeric not null default 0 check (fees >= 0),
  occurred_at date not null default current_date,
  notes text not null default '',
  source text not null check (source in ('manual', 'natural_language', 'import')),
  external_key text,
  created_at timestamptz not null default now(),
  check (
    (action in ('cash_deposit', 'cash_withdrawal') and symbol is null and quantity is null)
    or
    (action in ('buy', 'sell', 'position_import') and symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$' and quantity > 0)
  ),
  unique (portfolio_id, external_key)
);

create index if not exists portfolios_owner_created on public.portfolios (owner_id, created_at);
create index if not exists portfolio_transactions_portfolio_occurred on public.portfolio_transactions (portfolio_id, occurred_at, created_at);
create index if not exists portfolio_transactions_owner_symbol on public.portfolio_transactions (owner_id, symbol) where symbol is not null;

alter table public.portfolios enable row level security;
alter table public.portfolio_transactions enable row level security;

-- The supplied Robinhood holdings snapshot is a cost-basis import dated 2026-07-30.
-- It is intentionally not presented as a live quote source; the application uses its current market snapshot for valuation.
insert into public.portfolios (owner_id, name, kind, initial_funds, started_at)
values
  ('00000000-0000-4000-8000-000000000001', 'Personal', 'brokerage', 0, '2026-07-30'),
  ('00000000-0000-4000-8000-000000000001', 'Dad & Aarush', 'manual', 100000, '2026-07-31')
on conflict (owner_id, name) do nothing;

insert into public.portfolio_transactions (owner_id, portfolio_id, action, symbol, quantity, price_per_share, fees, occurred_at, notes, source, external_key)
select
  '00000000-0000-4000-8000-000000000001',
  portfolio.id,
  'position_import',
  source.symbol,
  source.quantity,
  source.average_cost,
  0,
  '2026-07-30',
  'Imported Robinhood Individual holdings snapshot supplied 2026-07-30.',
  'import',
  'robinhood-holdings-2026-07-30-' || source.symbol
from (values
  ('AMD', 1.551313::numeric, 354.54::numeric),
  ('ARM', 4.131152::numeric, 193.65::numeric),
  ('COST', 0.206141::numeric, 973.12::numeric),
  ('GOOGL', 3.06013::numeric, 245.69::numeric),
  ('HIMS', 0.940512::numeric, 42.53::numeric),
  ('INR', 21.498447::numeric, 16.28::numeric),
  ('LLY', 1.498887::numeric, 903.38::numeric),
  ('META', 1.629517::numeric, 639.40::numeric),
  ('MSFT', 1.440662::numeric, 417.38::numeric),
  ('MU', 1.537553::numeric, 715.57::numeric),
  ('NOW', 5.085435::numeric, 98.32::numeric),
  ('NVDA', 7.329617::numeric, 193.27::numeric),
  ('RKLB', 14.790386::numeric, 82.95::numeric),
  ('SHOP', 8.294356::numeric, 108.51::numeric),
  ('TSLA', 0.506349::numeric, 375.24::numeric),
  ('WMT', 4.322489::numeric, 99.27::numeric),
  ('XLK', 0.838448::numeric, 107.33::numeric),
  ('XLU', 2.404968::numeric, 38.60::numeric)
) as source(symbol, quantity, average_cost)
join public.portfolios portfolio
  on portfolio.owner_id = '00000000-0000-4000-8000-000000000001'
  and portfolio.name = 'Personal'
on conflict (portfolio_id, external_key) do nothing;

commit;
