begin;
set local lock_timeout = '5s';

-- Avoid scanning the entire durable job history to find one last successful
-- publication. This query was exceeding the API statement timeout in production.
create index if not exists agent_jobs_successful_type_time
  on public.agent_jobs (job_type, updated_at desc) where status = 'succeeded';

create index if not exists world_file_index_recent_journals
  on public.world_file_index (commit_sha, as_of desc) where kind = 'journal';

commit;
