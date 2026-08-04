begin;

-- The analyst and adversarial critic are separate bounded model calls. Keep
-- both providers and models with the immutable research artifact so a later
-- revision can be audited against the exact critique that gated it.
alter table public.market_hypothesis_research_versions
  add column if not exists critic_provider text,
  add column if not exists critic_model text,
  add column if not exists critic_generated_at timestamptz;

commit;
