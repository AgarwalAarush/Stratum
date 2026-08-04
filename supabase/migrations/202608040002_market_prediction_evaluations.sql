begin;

create table if not exists public.market_thesis_prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.market_thesis_predictions(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('running', 'complete', 'failed')),
  verdict text not null check (verdict in ('confirmed', 'disconfirmed', 'inconclusive')),
  rationale text not null default '',
  source_ids jsonb not null default '[]'::jsonb,
  observation_ids jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  data_as_of timestamptz not null,
  generated_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (prediction_id, version)
);

create index if not exists market_prediction_evaluations_latest
  on public.market_thesis_prediction_evaluations (prediction_id, version desc);

alter table public.market_thesis_prediction_evaluations enable row level security;

commit;
