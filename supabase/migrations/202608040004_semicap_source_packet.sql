begin;

insert into public.world_source_registry (slug, label, publisher, canonical_url, source_tier, source_kind, status, evidence_classes, discovered_by, approved_at)
values
  ('sec-nvidia-fy2026-10k', 'NVIDIA fiscal 2026 Form 10-K', 'NVIDIA Corporation', 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm', 'primary', 'filing', 'approved', '["company_disclosure"]'::jsonb, 'seed', now()),
  ('sec-asml-fy2025-20f', 'ASML 2025 Form 20-F', 'ASML Holding N.V.', 'https://www.sec.gov/Archives/edgar/data/937966/000162828026011378/asml-20251231.htm', 'primary', 'filing', 'approved', '["company_disclosure","technical_research"]'::jsonb, 'seed', now()),
  ('sec-micron-fy2025-10k', 'Micron fiscal 2025 annual report', 'Micron Technology', 'https://www.sec.gov/Archives/edgar/data/723125/000072312525000040/202510karscopy.pdf', 'primary', 'pdf', 'approved', '["company_disclosure"]'::jsonb, 'seed', now()),
  ('bis-semiconductor-export-policy', 'BIS semiconductor export license-review policy', 'U.S. Bureau of Industry and Security', 'https://www.bis.gov/sites/default/files/documents/DoC%20Revises%20License%20Review%20Policy%20for%20Semiconductors%20Exports.pdf', 'regulatory', 'pdf', 'approved', '["regulatory_data"]'::jsonb, 'seed', now())
on conflict (slug) do nothing;

insert into public.world_source_contract_versions (source_id, version, status, allowed_hosts, allowed_paths, accepted_mime_types, cadence, assertions_allowed, retention_days, notes)
select id, 1, 'active',
  case when slug = 'bis-semiconductor-export-policy' then '["bis.gov"]'::jsonb else '["sec.gov"]'::jsonb end,
  '[]'::jsonb, case when source_kind = 'pdf' then '["application/pdf","text/html"]'::jsonb else '["text/html"]'::jsonb end,
  'weekly', '["fact","estimate","claim"]'::jsonb, null,
  'Seeded primary/regulatory semicap source contract; future revisions retain the prior contract version.'
from public.world_source_registry
where slug in ('sec-nvidia-fy2026-10k', 'sec-asml-fy2025-20f', 'sec-micron-fy2025-10k', 'bis-semiconductor-export-policy')
on conflict (source_id, version) do nothing;

insert into public.world_source_domains (source_id, domain_id, role)
select id, 'semicap-data-center-equipment', 'core'
from public.world_source_registry
where slug in ('sec-nvidia-fy2026-10k', 'sec-asml-fy2025-20f', 'sec-micron-fy2025-10k', 'bis-semiconductor-export-policy')
on conflict (source_id, domain_id) do nothing;

commit;
