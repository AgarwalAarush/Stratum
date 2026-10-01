begin;
alter table public.agent_jobs drop constraint agent_jobs_status_check;
alter table public.agent_jobs add constraint agent_jobs_status_check check(status in ('queued','running','succeeded','failed','cancelled','blocked'));
alter table public.agent_jobs add column blocked_on jsonb;

create or replace function public.finish_agent_attempt(
 p_job_id uuid,p_run_id uuid,p_worker_id text,p_success boolean,p_output jsonb,
 p_error text,p_duration_ms integer,p_run_after timestamptz
) returns void language plpgsql security definer set search_path=public as $$
declare j public.agent_jobs; r public.agent_runs;
begin
 select * into j from agent_jobs where id=p_job_id for update;
 select * into r from agent_runs where id=p_run_id for update;
 if j.id is null or r.id is null or r.job_id<>j.id or r.worker_id<>p_worker_id then raise exception 'Unknown agent attempt'; end if;
 if r.status<>'running' then
   if (p_success and r.status='succeeded') or (not p_success and r.status='failed') then return; end if;
   raise exception 'Attempt already completed differently';
 end if;
 if j.status<>'running' or j.claimed_by is distinct from p_worker_id or
   exists(select 1 from agent_runs newer where newer.job_id=j.id and newer.started_at>r.started_at)
 then raise exception 'Agent lease no longer belongs to this attempt'; end if;
 update agent_runs set status=case when p_success then 'succeeded' else 'failed' end,
   output=case when p_success then p_output else output end,error=case when p_success then null else left(p_error,2000) end,
   finished_at=now(),duration_ms=greatest(0,p_duration_ms) where id=r.id;
 update agent_jobs set status=case when p_success and j.job_type='prune-market-data' and p_output->>'continuation'='true' then 'queued' when p_success then 'succeeded' when p_output->>'readiness'='blocked' then 'blocked' when attempts<max_attempts then 'queued' else 'failed' end,
   attempts=case when p_success and j.job_type='prune-market-data' and p_output->>'continuation'='true' then greatest(0,attempts-1) else attempts end,
   blocked_on=case when not p_success and p_output->>'readiness'='blocked' then p_output else null end,
   last_error=case when p_success then null else left(p_error,2000) end,
   run_after=case when p_success and j.job_type='prune-market-data' and p_output->>'continuation'='true' then now()+interval '1 minute' else coalesce(p_run_after,run_after) end,claimed_by=null,claimed_at=null,updated_at=now() where id=j.id;
end $$;
revoke all on function public.finish_agent_attempt(uuid,uuid,text,boolean,jsonb,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.finish_agent_attempt(uuid,uuid,text,boolean,jsonb,text,integer,timestamptz) to service_role;
create or replace function public.claim_agent_job(p_worker_id text)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.agent_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('stratum-agent-claim'));
  select * into claimed
  from public.agent_jobs
  where status = 'queued'
    and run_after <= now()
    and attempts < max_attempts
    and (job_type <> 'run-world-thinker' or not exists(select 1 from agent_jobs busy where busy.job_type='run-world-thinker' and busy.status='running'))
  order by priority asc, run_after asc, created_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update public.agent_jobs
    set status = 'running', claimed_by = p_worker_id, claimed_at = now(), attempts = attempts + 1, updated_at = now()
    where id = claimed.id
    returning * into claimed;

  return claimed;
end;
$$;

commit;
