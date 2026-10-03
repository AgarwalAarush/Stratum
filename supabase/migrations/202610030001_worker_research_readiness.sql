begin;

-- Nullable additions preserve old workers during a staged deployment. Missing
-- values are unknown readiness, never evidence that an old worker is upgraded.
alter table public.worker_heartbeats
  add column if not exists release_sha text,
  add column if not exists research_contract_version integer,
  add column if not exists health_status text,
  add column if not exists last_loop_at timestamptz;
alter table public.agent_jobs add column if not exists research_retry_count integer not null default 0;

create or replace function public.enqueue_bounded_research_job(
  p_job_type text, p_payload jsonb, p_dedupe_key text,
  p_active_limit integer default 4, p_priority integer default 20
) returns table(id uuid, deduplicated boolean, status text, admitted boolean)
language plpgsql security definer set search_path = public as $$
declare
  existing public.agent_jobs;
  required_release text := nullif(p_payload->>'requiredWorkerRelease', '');
  required_contract text := nullif(p_payload->>'requiredResearchContractVersion', '');
begin
  if p_job_type not in ('generate-company-research','event-refresh-company-research','generate-etf-research')
    or nullif(p_payload->>'ownerId','') is null or nullif(p_payload->>'symbol','') is null
    or nullif(p_dedupe_key,'') is null or p_active_limit is null or p_active_limit < 1 or p_active_limit > 4
    then raise exception 'Invalid bounded research admission'; end if;
  perform pg_advisory_xact_lock(hashtext('stratum-research-admission'));

  -- Readiness is checked in the transaction as well as in the operator preflight.
  if required_release is not null or required_contract is not null then
    if not exists(select 1 from worker_heartbeats h where h.last_seen_at between now()-interval '3 minutes' and now())
      or exists(select 1 from worker_heartbeats h
        where h.last_seen_at between now()-interval '3 minutes' and now()
          and (h.health_status is distinct from 'healthy'
            or h.last_loop_at is null or h.last_loop_at < now()-interval '3 minutes' or h.last_loop_at > now()
            or not h.fmp_enabled or not h.codex_enabled
            or (required_release is not null and h.release_sha is distinct from required_release)
            or (required_contract is not null and h.research_contract_version::text is distinct from required_contract)))
    then return query select null::uuid,false,'worker_not_ready'::text,false; return; end if;
  end if;

  select * into existing from agent_jobs j
    where j.job_type in ('generate-company-research','event-refresh-company-research','generate-etf-research')
      and j.status in ('queued','running')
      and j.payload->>'ownerId'=p_payload->>'ownerId'
      and upper(j.payload->>'symbol')=upper(p_payload->>'symbol')
    order by j.created_at asc limit 1;
  if existing.id is not null then
    return query select existing.id,true,existing.status,true; return;
  end if;
  select * into existing from agent_jobs j where j.dedupe_key=p_dedupe_key limit 1;
  if existing.id is not null then
    if existing.status='failed' and p_payload->>'reason'='portfolio-contract-upgrade' then
      if existing.research_retry_count>=2 then
        return query select existing.id,true,'retry_exhausted'::text,false; return;
      end if;
      if (select count(*) from agent_jobs j where j.job_type in ('generate-company-research','event-refresh-company-research','generate-etf-research') and j.status in ('queued','running')) >= p_active_limit then
        return query select null::uuid,false,'capacity'::text,false; return;
      end if;
      -- Keep immutable agent_runs as failure history. A retry is bounded and
      -- explicitly counted instead of making the holding permanently absent.
      update agent_jobs j set status='queued',attempts=0,research_retry_count=j.research_retry_count+1,
        payload=p_payload,claimed_by=null,claimed_at=null,run_after=now(),updated_at=now()
        where j.id=existing.id returning * into existing;
      return query select existing.id,false,'queued'::text,true; return;
    end if;
    if existing.status in ('failed','blocked','cancelled') then
      return query select existing.id,true,existing.status,false; return;
    end if;
    return query select existing.id,true,existing.status,true; return;
  end if;
  if (select count(*) from agent_jobs j
      where j.job_type in ('generate-company-research','event-refresh-company-research','generate-etf-research')
        and j.status in ('queued','running')) >= p_active_limit then
    return query select null::uuid,false,'capacity'::text,false; return;
  end if;
  insert into agent_jobs(job_type,payload,dedupe_key,priority)
    values(p_job_type,p_payload,p_dedupe_key,greatest(0,least(1000,p_priority)))
    returning * into existing;
  return query select existing.id,false,existing.status,true;
end $$;
revoke all on function public.enqueue_bounded_research_job(text,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.enqueue_bounded_research_job(text,jsonb,text,integer,integer) to service_role;

-- Explicit repair/manual jobs may wait durably beyond the planner's pending
-- limit. Actual research execution is still bounded across every worker.
create or replace function public.claim_agent_job(p_worker_id text)
returns public.agent_jobs language plpgsql security definer set search_path=public as $$
declare claimed public.agent_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('stratum-agent-claim'));
  select * into claimed from public.agent_jobs j
  where j.status='queued' and j.run_after<=now() and j.attempts<j.max_attempts
    and (j.job_type<>'run-world-thinker' or not exists(select 1 from agent_jobs busy where busy.job_type='run-world-thinker' and busy.status='running'))
    and (j.job_type not in ('generate-company-research','event-refresh-company-research','generate-etf-research')
      or (select count(*) from agent_jobs busy where busy.job_type in ('generate-company-research','event-refresh-company-research','generate-etf-research') and busy.status='running') < 4)
    and (j.job_type not in ('generate-company-research','event-refresh-company-research','generate-etf-research')
      or not exists(select 1 from agent_jobs busy
        where busy.job_type in ('generate-company-research','event-refresh-company-research','generate-etf-research') and busy.status='running'
          and busy.payload->>'ownerId'=j.payload->>'ownerId'
          and upper(busy.payload->>'symbol')=upper(j.payload->>'symbol')))
    and ((nullif(j.payload->>'requiredWorkerRelease','') is null and nullif(j.payload->>'requiredResearchContractVersion','') is null)
      or exists(select 1 from worker_heartbeats h where h.worker_id=p_worker_id
        and h.last_seen_at between now()-interval '3 minutes' and now()
        and h.last_loop_at between now()-interval '3 minutes' and now()
        and h.health_status='healthy' and h.fmp_enabled and h.codex_enabled
        and (nullif(j.payload->>'requiredWorkerRelease','') is null or h.release_sha=j.payload->>'requiredWorkerRelease')
        and (nullif(j.payload->>'requiredResearchContractVersion','') is null or h.research_contract_version::text=j.payload->>'requiredResearchContractVersion')))
  order by j.priority asc,j.run_after asc,j.created_at asc for update skip locked limit 1;
  if claimed.id is null then return null; end if;
  update public.agent_jobs set status='running',claimed_by=p_worker_id,claimed_at=now(),attempts=attempts+1,updated_at=now()
    where agent_jobs.id=claimed.id returning * into claimed;
  return claimed;
end $$;
revoke all on function public.claim_agent_job(text) from public,anon,authenticated;
grant execute on function public.claim_agent_job(text) to service_role;
commit;
