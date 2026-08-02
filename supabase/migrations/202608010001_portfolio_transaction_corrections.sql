begin;

-- Keep the original ledger row as evidence when a manual entry is corrected or removed.
alter table public.portfolio_transactions
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists replaced_by_id uuid references public.portfolio_transactions(id) on delete set null;

create index if not exists portfolio_transactions_active_portfolio_occurred
  on public.portfolio_transactions (portfolio_id, occurred_at, created_at)
  where voided_at is null;

commit;
