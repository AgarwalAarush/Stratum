begin;

alter table public.market_hypothesis_research_frontier
  drop constraint if exists market_hypothesis_research_frontier_status_check;

alter table public.market_hypothesis_research_frontier
  add constraint market_hypothesis_research_frontier_status_check
  check (status in ('queued', 'evidence_received', 'complete', 'blocked', 'deferred'));

-- Keep the accepted evidence and the originating discovery frontier in the
-- same transaction. A review cannot otherwise succeed while leaving the
-- research loop permanently deferred.
create or replace function public.accept_world_observation_proposal(
  p_proposal_id uuid,
  p_reviewer_id uuid,
  p_rationale text,
  p_fingerprint text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.world_observation_proposals;
  accepted_observation_id uuid;
  discovery_frontier_ids jsonb;
begin
  if nullif(btrim(p_rationale), '') is null then
    raise exception 'A review rationale is required';
  end if;
  if nullif(btrim(p_fingerprint), '') is null then
    raise exception 'An observation fingerprint is required';
  end if;

  select * into proposal
  from public.world_observation_proposals
  where id = p_proposal_id
  for update;

  if proposal.id is null then
    raise exception 'Observation proposal not found';
  end if;
  if exists (
    select 1 from public.world_observation_proposal_reviews
    where proposal_id = p_proposal_id
  ) then
    raise exception 'Observation proposal has already been reviewed';
  end if;

  insert into public.world_observations (
    document_id, assertion, observation_kind, domain, mechanism,
    confidence, materiality, novelty, fingerprint, metadata
  ) values (
    proposal.document_id, proposal.assertion, proposal.observation_kind,
    proposal.domain_id, proposal.mechanism, proposal.confidence,
    proposal.materiality, proposal.novelty, p_fingerprint,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'acceptedFromProposalId', proposal.id,
      'evidenceQuote', proposal.evidence_quote,
      'reviewerId', p_reviewer_id
    )
  ) on conflict (fingerprint) do nothing
  returning id into accepted_observation_id;

  if accepted_observation_id is null then
    select id into accepted_observation_id
    from public.world_observations
    where fingerprint = p_fingerprint;
  end if;
  if accepted_observation_id is null then
    raise exception 'Unable to create accepted observation';
  end if;

  insert into public.world_observation_proposal_reviews (
    proposal_id, reviewer_id, decision, rationale, observation_id
  ) values (
    p_proposal_id, p_reviewer_id, 'accepted', btrim(p_rationale), accepted_observation_id
  );

  select run.frontier_ids into discovery_frontier_ids
  from public.world_source_document_captures capture
  join public.world_source_registry source on source.id = capture.source_id
  join public.world_source_discovery_runs run on run.id = source.discovery_run_id
  where capture.id = proposal.source_capture_id;

  if discovery_frontier_ids is not null then
    update public.market_hypothesis_research_frontier
    set status = 'evidence_received',
        adapter_id = 'accepted-observation:' || accepted_observation_id::text,
        next_run_at = null,
        updated_at = now()
    where status = 'deferred'
      and id in (
        select value::uuid
        from jsonb_array_elements_text(discovery_frontier_ids)
        where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      );
  end if;

  return accepted_observation_id;
end;
$$;

revoke all on function public.accept_world_observation_proposal(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.accept_world_observation_proposal(uuid, uuid, text, text, jsonb) to service_role;

commit;
