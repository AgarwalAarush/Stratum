begin;

-- Claim-gate heartbeats count only running work. Keep those counts and their
-- attempt join independent of the retained job/attempt history heap.
create index if not exists agent_jobs_running_gate
  on public.agent_jobs (id)
  where status = 'running';

create index if not exists agent_runs_running_gate
  on public.agent_runs (job_id)
  where status = 'running';

commit;
