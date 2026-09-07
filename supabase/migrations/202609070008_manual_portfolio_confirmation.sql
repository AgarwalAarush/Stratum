create table public.portfolio_confirmations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 portfolio_id uuid not null references public.portfolios(id), request_id uuid not null,
 as_of timestamptz not null, confirmed_at timestamptz not null default now(),
 content jsonb not null, content_hash text not null, unique(owner_id,request_id)
);
create index portfolio_confirmation_latest on public.portfolio_confirmations(owner_id,portfolio_id,confirmed_at desc);
alter table public.portfolio_confirmations enable row level security;
create trigger immutable_evidence before update or delete on public.portfolio_confirmations
for each row execute function public.reject_investment_evidence_mutation();
