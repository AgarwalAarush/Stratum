begin;

-- Stage 2: every feed referral reaches an explicit, attributable review
-- outcome. Registration creates only a source candidate; it never grants a
-- source contract, collection authority, or evidence status.
alter table public.world_source_referrals
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_rationale text;

-- Stage 3: retain the exact path by which a market-model exposure was
-- resolved to a public security and whether independent company research was
-- queued. These columns are lineage only; they confer no thesis or trade
-- authority.
alter table public.market_thesis_exposures
  add column if not exists resolution_method text
    check (resolution_method in ('analyst_source_candidate', 'source_ledger_match', 'manual')),
  add column if not exists resolution_reason text,
  add column if not exists source_ids uuid[] not null default '{}'::uuid[],
  add column if not exists research_job_id uuid references public.agent_jobs(id) on delete set null,
  add column if not exists research_queued_at timestamptz;

create index if not exists market_thesis_exposures_research_queue
  on public.market_thesis_exposures (verification_status, materiality desc, confidence desc)
  where symbol is not null and research_queued_at is null;

create or replace function public.register_world_source_referral(
  p_referral_id uuid,
  p_reviewer_id uuid,
  p_rationale text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  referral public.world_source_referrals%rowtype;
  source_id uuid;
  source_slug text;
begin
  if p_reviewer_id is null or length(trim(coalesce(p_rationale, ''))) < 3 then
    raise exception 'A reviewer and registration rationale are required';
  end if;

  select * into referral from public.world_source_referrals
    where id = p_referral_id for update;
  if referral.id is null then raise exception 'Source referral not found'; end if;
  if referral.status <> 'pending' then raise exception 'Source referral has already been reviewed'; end if;

  source_slug := 'feed-referral-' || substr(replace(referral.id::text, '-', ''), 1, 12);
  insert into public.world_source_registry (
    slug, label, publisher, canonical_url, source_tier, source_kind,
    status, evidence_classes, discovered_by, metadata
  ) values (
    source_slug,
    left(referral.title, 500),
    left(coalesce(nullif(referral.publisher, ''), referral.origin_url), 500),
    referral.source_url,
    'discovery', 'html', 'candidate', array['discovery']::text[], 'user',
    jsonb_build_object(
      'coverage', 'Point-in-time feed referral for ' || referral.domain_id,
      'whyThisSource', referral.reason,
      'limitations', jsonb_build_array('Feed discovery is not recurring-source authority', 'Article-level target requires contract review'),
      'referralId', referral.id,
      'feedItemId', referral.feed_item_id,
      'originUrl', referral.origin_url,
      'reviewRationale', trim(p_rationale)
    )
  ) returning id into source_id;

  insert into public.world_source_domains (source_id, domain_id, role)
    values (source_id, referral.domain_id, 'corroborating')
    on conflict (source_id, domain_id) do nothing;

  update public.world_source_referrals set
    status = 'registered', registered_source_id = source_id,
    registered_at = now(), reviewed_by = p_reviewer_id,
    review_rationale = trim(p_rationale), updated_at = now()
    where id = referral.id;

  return source_id;
end;
$$;

create or replace function public.dismiss_world_source_referral(
  p_referral_id uuid,
  p_reviewer_id uuid,
  p_rationale text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reviewer_id is null or length(trim(coalesce(p_rationale, ''))) < 3 then
    raise exception 'A reviewer and dismissal rationale are required';
  end if;
  update public.world_source_referrals set
    status = 'dismissed', dismissed_at = now(), dismissal_reason = trim(p_rationale),
    reviewed_by = p_reviewer_id, review_rationale = trim(p_rationale), updated_at = now()
    where id = p_referral_id and status = 'pending';
  if not found then raise exception 'Source referral was not found or has already been reviewed'; end if;
end;
$$;

revoke all on function public.register_world_source_referral(uuid, uuid, text) from public;
revoke all on function public.dismiss_world_source_referral(uuid, uuid, text) from public;

commit;
