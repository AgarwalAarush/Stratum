-- Freeze the provider with the immutable body; retry guarantees cannot change
-- underneath an edition merely because worker configuration changes.
alter table public.investment_newsletter_outbox add column delivery_provider text
  not null default 'resend' check(delivery_provider in ('resend','gmail'));

create or replace function public.claim_investment_newsletter(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.investment_newsletter_delivery; provider text;
begin
  select delivery_provider into strict provider from investment_newsletter_outbox where id=p_outbox_id;
  insert into investment_newsletter_delivery(outbox_id) values(p_outbox_id) on conflict do nothing;
  select * into strict d from investment_newsletter_delivery where outbox_id=p_outbox_id for update;
  if d.status in ('accepted','delivered','bounced','complained','suppressed') or d.lease_until>now() then return false; end if;
  -- SMTP has no provider idempotency guarantee. Even a worker crash before
  -- recording its response must never automatically send the edition again.
  if provider='gmail' and d.first_attempt_at is not null then
    update investment_newsletter_delivery set status='uncertain',lease_until=null,
      error='Gmail attempt requires mailbox reconciliation; automatic resend disabled',updated_at=now() where outbox_id=p_outbox_id;
    return false;
  end if;
  if d.first_attempt_at is not null and d.first_attempt_at<now()-interval '23 hours' then
    update investment_newsletter_delivery set status='uncertain',error='Original provider idempotency window expired; manual reconciliation required' where outbox_id=p_outbox_id;
    return false;
  end if;
  if exists(select 1 from investment_newsletter_delivery where status in ('bounced','complained','suppressed')) then return false; end if;
  update investment_newsletter_delivery set status='sending',first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where outbox_id=p_outbox_id;
  return true;
end; $$;
revoke all on function public.claim_investment_newsletter(uuid) from public,anon,authenticated;
grant execute on function public.claim_investment_newsletter(uuid) to service_role;
