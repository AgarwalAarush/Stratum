-- Preserve every weak signal while repairing metadata produced by the first
-- shadow sensor. Low-information observations become dormant; nothing is
-- deleted. ENSO activation conditions require explicit ENSO/El Nino/La Nina
-- language rather than substring matches such as "censorship" or "sensors".

with repaired as (
  select
    id,
    coalesce(
      jsonb_agg(condition order by ordinal)
        filter (where condition not in (
          'crop failure or food-price disruption',
          'hydropower or reservoir stress',
          'insurance losses or commodity disruption'
        )),
      '[]'::jsonb
    ) as retained_conditions
  from public.world_signals
  cross join lateral jsonb_array_elements_text(activation_conditions) with ordinality as item(condition, ordinal)
  where activation_conditions ? 'crop failure or food-price disruption'
    and lower(title || ' ' || summary) !~ '(^|[^a-z0-9])enso([^a-z0-9]|$)|el ni.o|la ni.a'
  group by id
)
update public.world_signals as signal
set activation_conditions = case
      when repaired.retained_conditions = '[]'::jsonb
        then '["new corroborating evidence establishes a durable economic channel"]'::jsonb
      else repaired.retained_conditions
    end,
    updated_at = now()
from repaired
where signal.id = repaired.id;

update public.world_signals
set status = 'dormant',
    next_review_at = greatest(next_review_at, now() + interval '180 days'),
    updated_at = now()
where status = 'observed'
  and jsonb_array_length(domains) = 0
  and jsonb_array_length(geographies) = 0
  and jsonb_array_length(economic_channels) = 0
  and activation_conditions = '["new corroborating evidence establishes a durable economic channel"]'::jsonb;

update public.world_signals
set search_text = concat_ws(' ',
  title,
  summary,
  (select string_agg(value, ' ') from jsonb_array_elements_text(entities)),
  (select string_agg(value, ' ') from jsonb_array_elements_text(geographies)),
  (select string_agg(value, ' ') from jsonb_array_elements_text(domains)),
  (select string_agg(value, ' ') from jsonb_array_elements_text(economic_channels)),
  (select string_agg(value, ' ') from jsonb_array_elements_text(activation_conditions))
),
updated_at = now();
