begin;

alter table public.agent_jobs add column if not exists dedupe_key text;

create unique index if not exists agent_jobs_dedupe_key
  on public.agent_jobs (dedupe_key)
  where dedupe_key is not null;

commit;
