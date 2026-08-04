begin;

-- The macro packet separates official policy, financial-conditions data,
-- observed trade transmission, and surveyed expectations. It does not make a
-- directional market call and remains subject to the normal activation gate.
insert into public.world_source_registry (slug, label, publisher, canonical_url, source_tier, source_kind, status, evidence_classes, discovered_by, approved_at)
values
  ('fed-fomc-june-2026', 'Federal Reserve FOMC statement, June 2026', 'Board of Governors of the Federal Reserve System', 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260617a.htm', 'regulatory', 'html', 'approved', '["regulatory_data"]'::jsonb, 'seed', now()),
  ('chicago-fed-nfci', 'Chicago Fed National Financial Conditions Index', 'Federal Reserve Bank of Chicago', 'https://www.chicagofed.org/research/data/nfci/current-data', 'regulatory', 'html', 'approved', '["regulatory_data"]'::jsonb, 'seed', now()),
  ('census-international-trade-current', 'U.S. International Trade in Goods and Services', 'U.S. Census Bureau and Bureau of Economic Analysis', 'https://www.census.gov/foreign-trade/current/index.html', 'regulatory', 'html', 'approved', '["operational_data"]'::jsonb, 'seed', now()),
  ('nyfed-survey-market-expectations', 'New York Fed Survey of Market Expectations', 'Federal Reserve Bank of New York', 'https://www.newyorkfed.org/markets/market-intelligence/survey-of-market-expectations', 'regulatory', 'html', 'approved', '["market_expectations"]'::jsonb, 'seed', now())
on conflict (slug) do nothing;

insert into public.world_source_contract_versions (source_id, version, status, allowed_hosts, allowed_paths, accepted_mime_types, cadence, assertions_allowed, retention_days, notes)
select id, 1, 'active',
  case slug
    when 'fed-fomc-june-2026' then '["federalreserve.gov"]'::jsonb
    when 'chicago-fed-nfci' then '["chicagofed.org"]'::jsonb
    when 'census-international-trade-current' then '["census.gov"]'::jsonb
    when 'nyfed-survey-market-expectations' then '["newyorkfed.org"]'::jsonb
  end,
  case slug
    when 'fed-fomc-june-2026' then '["/newsevents/pressreleases/monetary20260617a.htm"]'::jsonb
    when 'chicago-fed-nfci' then '["/research/data/nfci/current-data"]'::jsonb
    when 'census-international-trade-current' then '["/foreign-trade/current/"]'::jsonb
    when 'nyfed-survey-market-expectations' then '["/markets/market-intelligence/survey-of-market-expectations"]'::jsonb
  end,
  '["text/html"]'::jsonb, 'weekly', '["fact","estimate","claim"]'::jsonb, null,
  'Seeded macro/policy source contract; expectations are evidence of beliefs and all future revisions remain auditable.'
from public.world_source_registry
where slug in ('fed-fomc-june-2026', 'chicago-fed-nfci', 'census-international-trade-current', 'nyfed-survey-market-expectations')
on conflict (source_id, version) do nothing;

insert into public.world_source_domains (source_id, domain_id, role)
select id, 'macro-policy-geopolitics', 'core'
from public.world_source_registry
where slug in ('fed-fomc-june-2026', 'chicago-fed-nfci', 'census-international-trade-current', 'nyfed-survey-market-expectations')
on conflict (source_id, domain_id) do nothing;

commit;
