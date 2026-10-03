const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Reviewed operator SQL. It moves only existing, unstarted owned upgrade jobs.
 * The eight-slot reservation function remains unchanged. The durable job payload
 * records the owner's finite exception; retries reuse exactly those reservations. */
export function ownershipCatchUpSql(input: { ownerId: string; date: string; jobIds: string[]; key: string; reason: string }): string {
  if (!uuid.test(input.ownerId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || !input.jobIds.length || input.jobIds.length > 50 || input.jobIds.some(id => !uuid.test(id))
    || new Set(input.jobIds).size !== input.jobIds.length || !input.key || input.reason.length < 8) throw new Error('Invalid catch-up authorization')
  const ids = `array[${input.jobIds.map(quote).join(',')}]::uuid[]`
  const authorization = quote(JSON.stringify({ key: input.key, date: input.date, reason: input.reason, model: 'gpt-6.1-sol', jobIds: input.jobIds }))
  return `begin;
do $catchup$
declare target_owner uuid := ${quote(input.ownerId)}; target_date date := ${quote(input.date)};
 ids uuid[] := ${ids}; approval_record jsonb := ${authorization}::jsonb; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_owner::text||target_date::text,0));
 perform 1 from agent_jobs where id=any(ids) order by id for update;
 select count(*) into n from agent_jobs where id=any(ids) and payload->>'ownerId'=target_owner::text
   and payload->'ownerRequestedCatchUp'->>'key'=approval_record->>'key'
   and payload->'ownerRequestedCatchUp'->>'date'=target_date::text;
 if n=cardinality(ids) then return; end if;
 if n<>0 or target_date<>(now() at time zone 'America/New_York')::date then raise exception 'Catch-up is partial or outside its authorized date'; end if;
 if (select count(*) from research_investigation_slots where job_id=any(ids))<>cardinality(ids) then raise exception 'Catch-up requires one reservation per job'; end if;
 select count(*) into n from agent_jobs j join research_investigation_slots s on s.job_id=j.id
 where j.id=any(ids) and j.status='queued' and j.job_type in ('generate-company-research','generate-etf-research')
 and j.payload->>'ownerId'=target_owner::text and j.payload->>'researchPriority'='owned'
 and j.payload->>'targetContractVersion'='2' and j.payload->>'forceFullResearch'='true'
 and j.dedupe_key='research-upgrade:'||target_owner::text||':'||(j.payload->>'symbol')||':2'
 and s.owner_id=target_owner and s.symbol=j.payload->>'symbol' and s.reservation_key=j.dedupe_key
 and s.lane='owned' and s.contract_version=2 and s.started_at is null and s.investigation_date>target_date
 and not exists(select 1 from research_investigation_slots t where t.owner_id=target_owner and t.investigation_date=target_date and t.symbol=s.symbol);
 if n<>cardinality(ids) then raise exception 'Catch-up requires exact queued, unstarted owned upgrades'; end if;
 update research_investigation_slots set investigation_date=target_date where job_id=any(ids) and owner_id=target_owner;
 update agent_jobs set run_after=now(), priority=least(priority,12), updated_at=now(),
 payload=payload||jsonb_build_object('researchModel','gpt-6.1-sol','ownerRequestedCatchUp',approval_record||jsonb_build_object('recordedAt',now()))
 where id=any(ids) and status='queued';
end $catchup$;
commit;`
}
