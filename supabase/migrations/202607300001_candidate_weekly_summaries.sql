create table if not exists public.candidate_weekly_summaries (
  week_ending date primary key,
  period_start date not null,
  candidate_count integer not null check (candidate_count >= 0),
  content jsonb not null,
  generated_at timestamptz not null default now(),
  check (period_start <= week_ending)
);

alter table public.candidate_weekly_summaries enable row level security;
