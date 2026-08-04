begin;

-- Earlier research artifacts already preserve the critic's requiredResearch
-- list inside immutable critique JSON. Materialize those requirements as
-- governed frontier rows so the source-scout loop can act on live history as
-- well as future critic verdicts. This never admits a source or changes a
-- thesis; it only restores explicit, reviewable research work.
insert into public.market_hypothesis_research_frontier (
  hypothesis_id,
  research_version_id,
  question,
  causal_node,
  priority,
  source_types,
  adapter_id,
  status,
  evidence_needed
)
select
  research.hypothesis_id,
  research.id,
  requirement.question,
  'adversarial review',
  5,
  '["primary or regulatory source"]'::jsonb,
  'critic',
  'queued',
  'Resolve the critic requirement: ' || requirement.question
from public.market_hypothesis_research_versions as research
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(research.critique -> 'requiredResearch') = 'array' then research.critique -> 'requiredResearch'
    else '[]'::jsonb
  end
) as requirement(question)
where research.status = 'needs_revision'
  and btrim(requirement.question) <> ''
  and not exists (
    select 1
    from public.market_hypothesis_research_frontier as existing
    where existing.research_version_id = research.id
      and existing.adapter_id = 'critic'
      and lower(existing.question) = lower(btrim(requirement.question))
  );

commit;
