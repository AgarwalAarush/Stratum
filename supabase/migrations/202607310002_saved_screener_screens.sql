begin;

create table if not exists public.saved_screener_screens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.market_users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 48),
  query jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists saved_screener_screens_owner_name
  on public.saved_screener_screens (owner_id, lower(name));
create index if not exists saved_screener_screens_owner_updated
  on public.saved_screener_screens (owner_id, updated_at desc);

alter table public.saved_screener_screens enable row level security;

commit;
