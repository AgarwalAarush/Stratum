alter table public.world_replay_runs
  add column if not exists weeks_verified integer not null default 0 check (weeks_verified >= 0),
  add column if not exists weeks_projected integer not null default 0 check (weeks_projected >= 0),
  add column if not exists weeks_uncovered integer not null default 0 check (weeks_uncovered >= 0);

alter table public.world_replay_batches
  add column if not exists outcome text,
  add column if not exists historical_gap_search_attempted boolean not null default false,
  add column if not exists source_ids jsonb not null default '[]'::jsonb,
  add column if not exists source_urls jsonb not null default '[]'::jsonb,
  add column if not exists source_families jsonb not null default '[]'::jsonb,
  add column if not exists recovery_count integer not null default 0 check (recovery_count >= 0),
  add column if not exists last_progress_at timestamptz;

alter table public.world_replay_batches drop constraint if exists world_replay_batches_status_check;
alter table public.world_replay_batches add constraint world_replay_batches_status_check
  check (status in ('queued','clustering','thinking','screened','documented_empty','projected','fallback','quarantined','failed'));

alter table public.world_replay_batches drop constraint if exists world_replay_batches_outcome_check;
alter table public.world_replay_batches add constraint world_replay_batches_outcome_check
  check (outcome is null or outcome in ('screened','documented_empty','projected','fallback'));

comment on column public.world_replay_runs.weeks_completed is
  'Resolved weekly windows. This is not an evidence coverage metric; use weeks_verified and weeks_uncovered.';
comment on column public.world_replay_batches.source_ids is
  'Exact raw evidence identifiers considered in this replay window.';
comment on column public.world_replay_batches.outcome is
  'Truthful terminal result: evidence screened/projected, deterministic fallback, or explicitly uncovered after gap search.';

alter table public.world_coverage_frontiers
  add column if not exists evidence_event_count integer not null default 0 check (evidence_event_count >= 0),
  add column if not exists weak_signal_count integer not null default 0 check (weak_signal_count >= 0);

comment on column public.world_coverage_frontiers.evidence_event_count is
  'Recent event clusters attributed through structured event fields, not loose token overlap.';
comment on column public.world_coverage_frontiers.weak_signal_count is
  'Monitoring signals attributed to this frontier; signals do not imply active World promotion.';
