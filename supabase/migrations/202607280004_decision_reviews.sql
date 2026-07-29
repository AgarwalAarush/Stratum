begin;

alter table public.thesis_decisions add column if not exists version integer;
alter table public.thesis_decisions add column if not exists price_at_decision numeric;

with ranked as (
  select id, row_number() over (
    partition by owner_id, symbol
    order by created_at, id
  ) as decision_version
  from public.thesis_decisions
)
update public.thesis_decisions as decisions
set version = ranked.decision_version
from ranked
where decisions.id = ranked.id
  and decisions.version is null;

alter table public.thesis_decisions alter column version set not null;
create unique index if not exists thesis_decisions_owner_symbol_version
  on public.thesis_decisions (owner_id, symbol, version);

create table if not exists public.decision_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.thesis_decisions(id) on delete cascade,
  symbol text not null references public.market_assets(symbol) on delete cascade,
  outcome text not null check (outcome in ('working', 'not_working', 'invalidated', 'closed')),
  expectation_assessment text not null default '',
  lessons text not null default '',
  postmortem text not null default '',
  reviewed_at timestamptz not null default now(),
  unique (owner_id, decision_id)
);

create index if not exists decision_reviews_owner_latest
  on public.decision_reviews (owner_id, reviewed_at desc);

alter table public.decision_reviews enable row level security;

commit;
