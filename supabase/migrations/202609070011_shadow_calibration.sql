create table public.recommendation_shadow_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 experiment_id uuid not null references public.recommendation_policy_experiments(id),
 batch_id uuid not null references public.recommendation_batches(id),
 manifest_id uuid not null references public.recommendation_input_manifests(id),
 policy_key text not null, content jsonb not null, content_hash text not null,
 created_at timestamptz not null default now(), unique(experiment_id,batch_id)
);
create table public.recommendation_shadow_evaluations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 experiment_id uuid not null references public.recommendation_policy_experiments(id),
 evaluator_version text not null, content jsonb not null, content_hash text not null,
 created_at timestamptz not null default now(), unique(experiment_id,content_hash)
);
alter table public.recommendation_shadow_runs enable row level security;
alter table public.recommendation_shadow_evaluations enable row level security;
create trigger immutable_evidence before update or delete on public.recommendation_shadow_runs for each row execute function public.reject_investment_evidence_mutation();
create trigger immutable_evidence before update or delete on public.recommendation_shadow_evaluations for each row execute function public.reject_investment_evidence_mutation();
create index recommendation_shadow_owner on public.recommendation_shadow_runs(owner_id,created_at desc);
create index recommendation_shadow_evaluation_owner on public.recommendation_shadow_evaluations(owner_id,created_at desc);
