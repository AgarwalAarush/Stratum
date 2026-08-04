begin;

-- Evidence and its review trail are append-only. A correction must create a
-- new capture, proposal, or superseding observation; rewriting a stored row
-- would sever the provenance chain used by research, prediction evaluation,
-- and human review.
create or replace function public.prevent_world_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception '% rows are immutable; create a new provenance-linked artifact instead', tg_table_name;
end;
$$;

drop trigger if exists world_documents_immutable on public.world_documents;
create trigger world_documents_immutable
before update or delete on public.world_documents
for each row execute function public.prevent_world_evidence_mutation();

drop trigger if exists world_observations_immutable on public.world_observations;
create trigger world_observations_immutable
before update or delete on public.world_observations
for each row execute function public.prevent_world_evidence_mutation();

drop trigger if exists world_source_document_captures_immutable on public.world_source_document_captures;
create trigger world_source_document_captures_immutable
before update or delete on public.world_source_document_captures
for each row execute function public.prevent_world_evidence_mutation();

drop trigger if exists world_observation_proposals_immutable on public.world_observation_proposals;
create trigger world_observation_proposals_immutable
before update or delete on public.world_observation_proposals
for each row execute function public.prevent_world_evidence_mutation();

drop trigger if exists world_observation_proposal_reviews_immutable on public.world_observation_proposal_reviews;
create trigger world_observation_proposal_reviews_immutable
before update or delete on public.world_observation_proposal_reviews
for each row execute function public.prevent_world_evidence_mutation();

drop trigger if exists world_observation_proposal_triage_runs_immutable on public.world_observation_proposal_triage_runs;
create trigger world_observation_proposal_triage_runs_immutable
before update or delete on public.world_observation_proposal_triage_runs
for each row execute function public.prevent_world_evidence_mutation();

commit;
