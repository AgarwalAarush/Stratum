begin;

-- Exact queue health needs only these fields. Include quarantined events so the
-- aggregate can read a compact covering index instead of the wide event heap.
create index if not exists world_event_clusters_queue_health
  on public.world_event_clusters (processing_state, first_seen_at)
  include (source_diversity)
  where processing_state in ('pending', 'failed', 'quarantined');

commit;
