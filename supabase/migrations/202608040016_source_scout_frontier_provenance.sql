begin;

-- Discovery runs are durable provenance records. A frontier-triggered scout
-- must retain the exact unresolved research questions that authorized its
-- candidate search, rather than relying on a transient queue payload.
alter table public.world_source_discovery_runs
  add column if not exists frontier_ids jsonb not null default '[]'::jsonb;

commit;
