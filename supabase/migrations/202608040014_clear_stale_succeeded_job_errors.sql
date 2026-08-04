begin;

-- `agent_runs` preserves every failed attempt. `agent_jobs.last_error` is the
-- current-job summary, so a terminal success must not retain a stale retry
-- failure and mislead control-plane readers.
update public.agent_jobs
set last_error = null,
    updated_at = now()
where status = 'succeeded'
  and last_error is not null;

commit;
