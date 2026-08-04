begin;

-- The packet covers the domain's four mechanisms without presenting any
-- issuer disclosure or policy assessment as a completed investment thesis.
insert into public.world_source_registry (slug, label, publisher, canonical_url, source_tier, source_kind, status, evidence_classes, discovered_by, approved_at)
values
  ('usgs-mcs-2026', 'USGS Mineral Commodity Summaries 2026', 'U.S. Geological Survey', 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf', 'regulatory', 'pdf', 'approved', '["regulatory_data","operational_data"]'::jsonb, 'seed', now()),
  ('doe-critical-materials-assessment', 'DOE critical minerals and materials assessment', 'U.S. Department of Energy', 'https://www.energy.gov/cmm/what-are-critical-minerals-and-materials', 'regulatory', 'html', 'approved', '["regulatory_data"]'::jsonb, 'seed', now()),
  ('sec-mp-materials-2025-10k', 'MP Materials fiscal 2025 annual report', 'MP Materials Corp.', 'https://www.sec.gov/Archives/edgar/data/1801368/000180136826000008/mp-20251231.htm', 'primary', 'filing', 'approved', '["company_disclosure"]'::jsonb, 'seed', now()),
  ('lynas-fy2025-annual-report', 'Lynas FY2025 annual report', 'Lynas Rare Earths Limited', 'https://announcements.asx.com.au/asxpdf/20250828/pdf/06ngtkbmf2fb5g.pdf', 'primary', 'filing', 'approved', '["company_disclosure"]'::jsonb, 'seed', now())
on conflict (slug) do nothing;

insert into public.world_source_contract_versions (source_id, version, status, allowed_hosts, allowed_paths, accepted_mime_types, cadence, assertions_allowed, retention_days, notes)
select id, 1, 'active',
  case slug
    when 'usgs-mcs-2026' then '["pubs.usgs.gov"]'::jsonb
    when 'doe-critical-materials-assessment' then '["energy.gov"]'::jsonb
    when 'sec-mp-materials-2025-10k' then '["sec.gov"]'::jsonb
    when 'lynas-fy2025-annual-report' then '["announcements.asx.com.au"]'::jsonb
  end,
  case slug
    when 'usgs-mcs-2026' then '["/periodicals/mcs2026/"]'::jsonb
    when 'doe-critical-materials-assessment' then '["/cmm/"]'::jsonb
    when 'sec-mp-materials-2025-10k' then '["/Archives/edgar/data/1801368/"]'::jsonb
    when 'lynas-fy2025-annual-report' then '["/asxpdf/"]'::jsonb
  end,
  case slug
    when 'doe-critical-materials-assessment' then '["text/html","application/pdf"]'::jsonb
    else '["application/pdf","text/html"]'::jsonb
  end,
  'weekly', '["fact","estimate","claim"]'::jsonb, null,
  'Seeded critical-materials packet contract; source health and future revisions remain auditable.'
from public.world_source_registry
where slug in ('usgs-mcs-2026', 'doe-critical-materials-assessment', 'sec-mp-materials-2025-10k', 'lynas-fy2025-annual-report')
on conflict (source_id, version) do nothing;

insert into public.world_source_domains (source_id, domain_id, role)
select id, 'critical-materials', 'core'
from public.world_source_registry
where slug in ('usgs-mcs-2026', 'doe-critical-materials-assessment', 'sec-mp-materials-2025-10k', 'lynas-fy2025-annual-report')
on conflict (source_id, domain_id) do nothing;

commit;
