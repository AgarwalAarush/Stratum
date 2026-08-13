begin;

-- Intelligence and Markets feeds can suggest where to look next, but they are
-- not part of the governed market-evidence ledger. Referrals preserve that
-- discovery trail and require an explicit reviewer handoff before a source
-- candidate, contract, or collection authority can exist.
create table if not exists public.world_source_referrals (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null,
  domain_id text not null references public.market_domain_packs(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'registered', 'dismissed')),
  feed_scope text not null,
  feed_section text not null,
  title text not null,
  source_url text not null,
  origin_url text not null,
  publisher text,
  published_at timestamptz,
  reason text not null,
  registered_source_id uuid references public.world_source_registry(id) on delete set null,
  registered_at timestamptz,
  dismissed_at timestamptz,
  dismissal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feed_item_id, domain_id)
);

create index if not exists world_source_referrals_domain_status_created
  on public.world_source_referrals (domain_id, status, created_at desc);
create index if not exists world_source_referrals_pending_created
  on public.world_source_referrals (status, created_at desc);

alter table public.world_source_referrals enable row level security;

commit;
