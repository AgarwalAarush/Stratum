begin;

create index if not exists market_universe_members_symbol
  on public.market_universe_members (symbol);

create index if not exists market_watchlist_items_symbol
  on public.market_watchlist_items (symbol);

commit;
