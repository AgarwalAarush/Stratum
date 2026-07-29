begin;

create table if not exists public.market_users (
  id uuid primary key,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.market_users (id, label)
values ('00000000-0000-4000-8000-000000000001', 'Private Markets owner')
on conflict (id) do nothing;

insert into public.market_users (id, label)
select owner_id, 'Imported Markets owner'
from (
  select owner_id from public.market_watchlists
  union
  select owner_id from public.company_packets
  union
  select owner_id from public.equity_research_notes
  union
  select owner_id from public.thesis_decisions
  union
  select owner_id from public.manual_positions
  union
  select owner_id from public.decision_inbox_items
  union
  select owner_id from public.decision_reviews
  union
  select owner_id from public.candidate_briefs
) existing
where owner_id is not null
on conflict (id) do nothing;

alter table public.market_watchlists
  drop constraint if exists market_watchlists_owner_id_fkey,
  add constraint market_watchlists_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.company_packets
  drop constraint if exists company_packets_owner_id_fkey,
  add constraint company_packets_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.equity_research_notes
  drop constraint if exists equity_research_notes_owner_id_fkey,
  add constraint equity_research_notes_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.thesis_decisions
  drop constraint if exists thesis_decisions_owner_id_fkey,
  add constraint thesis_decisions_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.manual_positions
  drop constraint if exists manual_positions_owner_id_fkey,
  add constraint manual_positions_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.decision_inbox_items
  drop constraint if exists decision_inbox_items_owner_id_fkey,
  add constraint decision_inbox_items_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.decision_reviews
  drop constraint if exists decision_reviews_owner_id_fkey,
  add constraint decision_reviews_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.candidate_briefs
  drop constraint if exists candidate_briefs_owner_id_fkey,
  add constraint candidate_briefs_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

alter table public.market_users enable row level security;

commit;
