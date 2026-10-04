begin;

-- Aggregate in Postgres so the API row cap cannot silently truncate health.
create or replace function public.world_event_queue_health()
returns table (
  pending_events bigint,
  failed_events bigint,
  quarantined_events bigint,
  oldest_pending_at timestamptz,
  source_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where processing_state = 'pending'),
    count(*) filter (where processing_state = 'failed'),
    count(*) filter (where processing_state = 'quarantined'),
    min(first_seen_at) filter (where processing_state in ('pending', 'failed')),
    coalesce(sum(source_diversity), 0)::bigint
  from public.world_event_clusters
  where processing_state in ('pending', 'failed', 'quarantined');
$$;

revoke all on function public.world_event_queue_health() from public, anon, authenticated;
grant execute on function public.world_event_queue_health() to service_role;

commit;
