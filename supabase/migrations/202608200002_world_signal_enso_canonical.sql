-- Keep one canonical active ENSO concept after the deterministic concept ID was
-- introduced. Older descriptions remain readable and retain their full source
-- and event lineage; only their active-memory status changes.

with enso_signals as (
  select id, first_observed_at
  from public.world_signals
  where translate(lower(coalesce(title, '') || ' ' || coalesce(summary, '')), 'ñ', 'n')
    ~ '(^|[^a-z0-9])(enso|el nino|la nina)([^a-z0-9]|$)'
), keeper as (
  select coalesce(
    (select id from enso_signals where id = 'signal-4e0b1f2895ea150dd34172bc' limit 1),
    (select id from enso_signals order by first_observed_at asc, id asc limit 1)
  ) as id
)
update public.world_signals as signal
set status = 'superseded',
    related_signal_ids = case
      when signal.related_signal_ids ? keeper.id then signal.related_signal_ids
      else signal.related_signal_ids || jsonb_build_array(keeper.id)
    end,
    updated_at = now()
from enso_signals
cross join keeper
where signal.id = enso_signals.id
  and signal.id <> keeper.id
  and signal.status <> 'superseded';
