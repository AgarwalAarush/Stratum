begin;

-- A backward-compatible gate for every worker using the existing claim RPC.
-- Pause/resume and claims share a lock, so a pause cannot race a new claim.
create table public.worker_claim_gate (
  singleton boolean primary key default true check (singleton),
  paused boolean not null default false,
  reason text,
  expected_release_sha text check (expected_release_sha is null or expected_release_sha ~ '^[0-9a-f]{40}$'),
  updated_at timestamptz not null default now()
);
insert into public.worker_claim_gate(singleton) values (true);
alter table public.worker_claim_gate enable row level security;
revoke all on public.worker_claim_gate from public, anon, authenticated;
grant all on public.worker_claim_gate to service_role;

create function public.worker_claim_gate_status()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'paused', g.paused,
    'reason', g.reason,
    'expected_release_sha', g.expected_release_sha,
    'running_jobs', (select count(*) from public.agent_jobs where status = 'running'),
    'running_attempts', (select count(*) from public.agent_runs r
      join public.agent_jobs j on j.id = r.job_id where r.status = 'running' and j.status = 'running'),
    'checked_at', now()
  ) from public.worker_claim_gate g where g.singleton;
$$;

create function public.set_worker_claim_gate(
  p_paused boolean,
  p_reason text default null,
  p_expected_release_sha text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.worker_claim_gate;
begin
  perform pg_advisory_xact_lock(hashtext('stratum-agent-claim'));
  select * into strict g from public.worker_claim_gate where singleton for update;
  if p_paused is null or p_expected_release_sha is null or p_expected_release_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'A valid release SHA is required to change worker claims';
  end if;
  if p_paused and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required to pause worker claims';
  end if;
  if not p_paused and g.expected_release_sha is distinct from p_expected_release_sha then
    raise exception 'Worker resume release does not match the paused release';
  end if;
  update public.worker_claim_gate set paused = p_paused,
    reason = case when p_paused then left(trim(p_reason), 1000) else null end,
    expected_release_sha = p_expected_release_sha, updated_at = now() where singleton;
  return public.worker_claim_gate_status();
end;
$$;

create or replace function public.claim_agent_job(p_worker_id text)
returns public.agent_jobs language plpgsql security definer set search_path = public as $$
declare claimed public.agent_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('stratum-agent-claim'));
  if (select paused from public.worker_claim_gate where singleton) then return null; end if;
  select * into claimed from public.agent_jobs
  where status = 'queued' and run_after <= now() and attempts < max_attempts
    and (job_type <> 'run-world-thinker' or not exists(
      select 1 from public.agent_jobs busy where busy.job_type = 'run-world-thinker' and busy.status = 'running'))
  order by priority asc, run_after asc, created_at asc
  for update skip locked limit 1;
  if claimed.id is null then return null; end if;
  update public.agent_jobs set status = 'running', claimed_by = p_worker_id,
    claimed_at = now(), attempts = attempts + 1, updated_at = now()
  where id = claimed.id returning * into claimed;
  return claimed;
end;
$$;

revoke all on function public.worker_claim_gate_status() from public, anon, authenticated;
revoke all on function public.set_worker_claim_gate(boolean,text,text) from public, anon, authenticated;
revoke all on function public.claim_agent_job(text) from public, anon, authenticated;
grant execute on function public.worker_claim_gate_status() to service_role;
grant execute on function public.set_worker_claim_gate(boolean,text,text) to service_role;
grant execute on function public.claim_agent_job(text) to service_role;
notify pgrst, 'reload schema';
commit;
