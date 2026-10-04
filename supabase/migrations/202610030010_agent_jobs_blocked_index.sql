begin;

-- Worker maintenance reads the small blocked set before claiming new work.
-- Completed job history must not make that readiness check scan the heap.
create index if not exists agent_jobs_blocked_maintenance
  on public.agent_jobs (id) where status = 'blocked';

commit;
