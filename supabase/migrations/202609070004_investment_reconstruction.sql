begin;
create table public.investment_macro_vintages (
 id uuid primary key default gen_random_uuid(),series_id text not null,content_hash text not null,
 observed_at timestamptz not null default now(),content jsonb not null,unique(series_id,content_hash)
);
alter table public.investment_macro_vintages enable row level security;
create trigger immutable_evidence before update or delete on public.investment_macro_vintages for each row execute function public.reject_investment_evidence_mutation();
create table public.investment_reconstruction_artifacts (
 id uuid primary key default gen_random_uuid(),replay_run_id uuid not null,
 window_start timestamptz not null,decision_cutoff timestamptz not null,
 content_hash text not null,content jsonb not null,created_at timestamptz not null default now(),
 unique(replay_run_id,window_start,decision_cutoff)
);
alter table public.investment_reconstruction_artifacts enable row level security;
create trigger immutable_evidence before update or delete on public.investment_reconstruction_artifacts for each row execute function public.reject_investment_evidence_mutation();
commit;
