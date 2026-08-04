begin;

-- An accepted proposal must never exist without its reviewer decision. Keep
-- the observation insert and immutable review record in the same transaction.
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

  return accepted_observation_id;
end;
$$;

revoke all on function public.accept_world_observation_proposal(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.accept_world_observation_proposal(uuid, uuid, text, text, jsonb) to service_role;

commit;
