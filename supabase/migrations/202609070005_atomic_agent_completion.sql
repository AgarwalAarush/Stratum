begin;
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
 update agent_jobs set status=case when p_success then 'succeeded' when attempts<max_attempts then 'queued' else 'failed' end,
   last_error=case when p_success then null else left(p_error,2000) end,
   run_after=coalesce(p_run_after,run_after),claimed_by=null,claimed_at=null,updated_at=now() where id=j.id;
end $$;
revoke all on function public.finish_agent_attempt(uuid,uuid,text,boolean,jsonb,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.finish_agent_attempt(uuid,uuid,text,boolean,jsonb,text,integer,timestamptz) to service_role;
commit;
