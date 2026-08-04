begin;

create table if not exists public.world_observation_proposal_reviews (
  proposal_id uuid primary key references public.world_observation_proposals(id) on delete restrict,
  reviewer_id uuid not null references public.market_users(id) on delete restrict,
  decision text not null check (decision in ('accepted', 'rejected')),
  rationale text not null,
  observation_id uuid references public.world_observations(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  check ((decision = 'accepted' and observation_id is not null) or (decision = 'rejected' and observation_id is null))
);

create index if not exists world_observation_proposal_reviews_reviewer_time
  on public.world_observation_proposal_reviews (reviewer_id, reviewed_at desc);

alter table public.world_observation_proposal_reviews enable row level security;

commit;
