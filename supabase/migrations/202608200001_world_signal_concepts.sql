-- Consolidate repeated ENSO descriptions into one active concept while keeping
-- every source and event in the immutable evidence/event ledgers. Supersession
-- is reversible metadata; this migration intentionally deletes nothing.

with enso_ranked as (
  select
    id,
    first_value(id) over (order by first_observed_at asc, id asc) as keeper_id,
    row_number() over (order by first_observed_at asc, id asc) as concept_rank
  from public.world_signals
  where translate(lower(coalesce(title, '') || ' ' || coalesce(summary, '')), 'ñ', 'n')
    ~ '(^|[^a-z0-9])(enso|el nino|la nina)([^a-z0-9]|$)'
), duplicates as (
  select id, keeper_id
  from enso_ranked
  where concept_rank > 1
)
update public.world_signals as signal
set status = 'superseded',
    related_signal_ids = case
      when signal.related_signal_ids ? duplicates.keeper_id then signal.related_signal_ids
      else signal.related_signal_ids || jsonb_build_array(duplicates.keeper_id)
    end,
    updated_at = now()
from duplicates
where signal.id = duplicates.id;
