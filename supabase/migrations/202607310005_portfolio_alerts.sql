begin;

-- Portfolio is a tracking workspace. Alerts must belong to a concrete portfolio,
-- not merely to an owner with a watchlist, candidate, or thesis.
alter table public.decision_inbox_items
  add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;

create index if not exists decision_inbox_portfolio_open
  on public.decision_inbox_items (owner_id, portfolio_id, status, occurred_at desc)
  where portfolio_id is not null;

-- Preserve historical alerts for positions that have a recorded imported or buy lot.
-- Candidate Scout and unsymbolized industry-thesis alerts are intentionally excluded:
-- discovery and thesis work belong in Overview, Explore, and Research.
update public.decision_inbox_items inbox
set portfolio_id = (
  select tx.portfolio_id
  from public.portfolio_transactions tx
  where tx.owner_id = inbox.owner_id
    and tx.symbol = inbox.symbol
    and tx.action in ('buy', 'position_import')
  order by tx.occurred_at desc, tx.created_at desc
  limit 1
)
where inbox.portfolio_id is null
  and inbox.symbol is not null
  and inbox.item_type not in ('new_candidate', 'thesis_refresh');

delete from public.decision_inbox_items
where portfolio_id is null;

commit;
