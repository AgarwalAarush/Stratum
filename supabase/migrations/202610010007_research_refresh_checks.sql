begin;
create table public.research_refresh_checks (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,symbol text not null,
 instrument_type text not null check(instrument_type in ('equity','etf')),research_note_id uuid,packet_id uuid not null,
 classification text not null check(classification in ('unchanged','reprice','revalidate','full_research')),
 evidence_hash text not null,input_hash text not null,content jsonb not null,created_at timestamptz not null default now(),
 unique(owner_id,symbol,input_hash)
);
create index on public.research_refresh_checks(owner_id,symbol,created_at desc);
alter table public.research_refresh_checks enable row level security;
create trigger immutable_refresh_check before update or delete on public.research_refresh_checks for each row execute function public.reject_investment_evidence_mutation();
commit;
