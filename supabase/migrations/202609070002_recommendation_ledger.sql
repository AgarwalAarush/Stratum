begin;
create table public.recommendation_input_manifests (
  id uuid primary key, owner_id uuid not null, decision_date date not null,
  decision_cutoff timestamptz not null, policy_version text not null,
  content_hash text not null, content jsonb not null, created_at timestamptz not null default now(),
  unique(owner_id, decision_date, policy_version),
  check(jsonb_typeof(content->'names')='array'), check(decision_cutoff <= created_at)
);
create table public.recommendation_batches (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  manifest_id uuid not null unique references public.recommendation_input_manifests(id),
  decision_date date not null, published_at timestamptz not null default now(),
  policy_version text not null, model_metadata jsonb not null, summary text not null,
  coverage jsonb not null, unique(owner_id,decision_date,policy_version)
);
create table public.recommendation_versions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  batch_id uuid not null references public.recommendation_batches(id),
  episode_id text not null, version integer not null check(version>0),
  supersedes_id uuid references public.recommendation_versions(id), portfolio_id uuid not null,
  security_id text not null, symbol text not null,
  action text not null check(action in ('research','watch','buy','add','hold','trim','sell','no_trade')),
  content jsonb not null, issued_at timestamptz not null default now(),
  unique(batch_id,portfolio_id,symbol), unique(owner_id,episode_id,version)
);
create table public.recommendation_forecasts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  recommendation_id uuid not null references public.recommendation_versions(id),
  ordinal integer not null, deadline timestamptz not null, probability numeric not null check(probability>0 and probability<1),
  content jsonb not null, unique(recommendation_id,ordinal)
);
create table public.recommendation_owner_events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  recommendation_id uuid not null references public.recommendation_versions(id),
  request_id uuid not null, event_type text not null check(event_type in ('acknowledged','accepted','rejected','delayed','modified','manually_executed','cancelled','correction')),
  rationale text not null check(length(rationale)>=3), details jsonb not null default '{}',
  occurred_at timestamptz not null, recorded_at timestamptz not null default now(), unique(owner_id,request_id)
);
create table public.recommendation_evaluations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  recommendation_id uuid not null references public.recommendation_versions(id),
  kind text not null check(kind in ('markout','thesis','attribution')),
  horizon text not null, as_of timestamptz not null, evaluator_version text not null,
  supersedes_id uuid references public.recommendation_evaluations(id),
  content jsonb not null, content_hash text not null, created_at timestamptz not null default now(),
  unique(recommendation_id,kind,horizon,content_hash)
);
create table public.recommendation_evaluation_tasks (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  recommendation_id uuid not null references public.recommendation_versions(id),
  kind text not null, horizon text not null, not_before timestamptz not null,
  status text not null default 'pending' check(status in ('pending','complete','needs_data')),
  last_checked_at timestamptz, error text, unique(recommendation_id,kind,horizon)
);
create table public.recommendation_cohort_reviews (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  cohort_key text not null, policy_version text not null, content jsonb not null,
  content_hash text not null, created_at timestamptz not null default now(), unique(owner_id,cohort_key,content_hash)
);
create table public.recommendation_policy_experiments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  parent_id uuid references public.recommendation_policy_experiments(id),
  event_type text not null check(event_type in ('registered','reviewed','promoted','rejected','rolled_back')),
  policy_key text not null, content jsonb not null, created_at timestamptz not null default now()
);
create table public.investment_newsletter_outbox (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, edition_date date not null,
  batch_id uuid references public.recommendation_batches(id), recipient text not null, sender text not null,
  subject text not null, html text not null, plain_text text not null, content_hash text not null,
  created_at timestamptz not null default now(), unique(owner_id,edition_date)
);
create table public.investment_newsletter_delivery (
  outbox_id uuid primary key references public.investment_newsletter_outbox(id),
  status text not null default 'pending' check(status in ('pending','sending','accepted','delivered','failed','uncertain','bounced','complained','suppressed')),
  first_attempt_at timestamptz, last_attempt_at timestamptz, lease_until timestamptz,
  provider_id text, attempts integer not null default 0, error text, updated_at timestamptz not null default now()
);
create table public.investment_newsletter_events (
  id text primary key, outbox_id uuid not null references public.investment_newsletter_outbox(id),
  event_type text not null, occurred_at timestamptz not null, received_at timestamptz not null default now()
);
-- Small, immutable evaluation vintages preserve actual observed prices without
-- turning the full screener history into an unbounded duplicate warehouse.
create table public.investment_price_vintages (
  id uuid primary key default gen_random_uuid(), symbol text not null, security_id text not null,
  session_date date not null, feed text not null, adjustment text not null,
  observed_at timestamptz not null default now(), source_as_of timestamptz not null,
  content_hash text not null, content jsonb not null, unique(symbol,session_date,feed,adjustment,content_hash)
);
create index on public.recommendation_versions(owner_id,issued_at desc);
create index on public.recommendation_evaluation_tasks(status,not_before);
create index on public.investment_price_vintages(symbol,session_date,observed_at);

-- Atomic publication: any invalid or missing name rolls back the whole batch,
-- forecast set and outcome schedule. No reader can see a partial publication.
create or replace function public.publish_recommendation_batch(p_manifest_id uuid, p_recommendations jsonb, p_metadata jsonb, p_summary text)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.recommendation_input_manifests; b uuid; r jsonb; n jsonb; f jsonb; rid uuid; previous public.recommendation_versions; episode text; ordinal integer; h integer;
begin
  select * into strict m from recommendation_input_manifests where id=p_manifest_id for update;
  select id into b from recommendation_batches where manifest_id=m.id;
  if b is not null then return b; end if;
  if jsonb_typeof(p_recommendations)<>'array' or jsonb_array_length(p_recommendations)<>jsonb_array_length(m.content->'names') then raise exception 'Incomplete daily coverage'; end if;
  insert into recommendation_batches(owner_id,manifest_id,decision_date,policy_version,model_metadata,summary,coverage)
    values(m.owner_id,m.id,m.decision_date,m.policy_version,p_metadata,p_summary,jsonb_build_object('required',jsonb_array_length(m.content->'names'),'published',jsonb_array_length(p_recommendations),'gaps',m.content->'gaps')) returning id into b;
  for r in select * from jsonb_array_elements(p_recommendations) loop
    select value into n from jsonb_array_elements(m.content->'names') where value->>'symbol'=r->>'symbol' and value->>'portfolioId'=r->>'portfolioId';
    if n is null then raise exception 'Name outside frozen context'; end if;
    if exists(select 1 from jsonb_array_elements_text(r->'sourceIds') s where not exists(select 1 from jsonb_array_elements(m.content->'evidence') e where e->>'id'=s.value and (e->>'availableAt')::timestamptz <= m.decision_cutoff)) then raise exception 'Unknown or future evidence'; end if;
    if r->>'action' in ('buy','add','hold','trim','sell') and (jsonb_array_length(r->'gateReasons')>0 or (r->>'expiresAt')::timestamptz <= now()) then raise exception 'Blocked or expired recommendation'; end if;
    episode := concat(r->>'portfolioId',':',n->>'securityId',':',coalesce(n->'thesis'->>'id','unestablished'));
    select * into previous from recommendation_versions where owner_id=m.owner_id and episode_id=episode order by version desc limit 1;
    insert into recommendation_versions(owner_id,batch_id,episode_id,version,supersedes_id,portfolio_id,security_id,symbol,action,content)
      values(m.owner_id,b,episode,coalesce(previous.version,0)+1,previous.id,(r->>'portfolioId')::uuid,n->>'securityId',r->>'symbol',r->>'action',r) returning id into rid;
    ordinal:=0;
    for f in select * from jsonb_array_elements(r->'forecasts') loop
      insert into recommendation_forecasts(owner_id,recommendation_id,ordinal,deadline,probability,content) values(m.owner_id,rid,ordinal,(f->>'deadline')::timestamptz,(f->>'probability')::numeric,f);
      ordinal:=ordinal+1;
    end loop;
    foreach h in array array[5,10,20] loop
      insert into recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before) values(m.owner_id,rid,'markout',h::text,now()+h*interval '1 day');
    end loop;
    insert into recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before) values(m.owner_id,rid,'markout','thesis_horizon',now()+(r->>'horizonDays')::integer*interval '1 day');
    insert into recommendation_evaluation_tasks(owner_id,recommendation_id,kind,horizon,not_before) select m.owner_id,rid,'thesis',rf.ordinal::text,rf.deadline from recommendation_forecasts rf where rf.recommendation_id=rid;
  end loop;
  return b;
end; $$;
revoke all on function public.publish_recommendation_batch(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.publish_recommendation_batch(uuid,jsonb,jsonb,text) to service_role;

do $$ declare t text; begin
  foreach t in array array['recommendation_input_manifests','recommendation_batches','recommendation_versions','recommendation_forecasts','recommendation_owner_events','recommendation_evaluations','recommendation_cohort_reviews','recommendation_policy_experiments','investment_newsletter_outbox','investment_newsletter_events','investment_price_vintages'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create trigger immutable_evidence before update or delete on public.%I for each row execute function public.reject_investment_evidence_mutation()',t);
  end loop;
end $$;
alter table public.recommendation_evaluation_tasks enable row level security;
alter table public.investment_newsletter_delivery enable row level security;
commit;

create or replace function public.claim_investment_newsletter(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.investment_newsletter_delivery;
begin
  insert into investment_newsletter_delivery(outbox_id) values(p_outbox_id) on conflict do nothing;
  select * into strict d from investment_newsletter_delivery where outbox_id=p_outbox_id for update;
  if d.status in ('accepted','delivered','bounced','complained','suppressed') or d.lease_until>now() then return false; end if;
  -- Resend's dedupe guarantee lasts 24h. Never resend an ambiguous old attempt.
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
create or replace function public.record_investment_newsletter_event(p_id text,p_outbox_id uuid,p_status text,p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('delivered','bounced','complained','suppressed') then raise exception 'Invalid delivery event'; end if;
  insert into investment_newsletter_events(id,outbox_id,event_type,occurred_at) values(p_id,p_outbox_id,p_status,p_occurred_at) on conflict do nothing;
  update investment_newsletter_delivery set status=p_status,updated_at=now() where outbox_id=p_outbox_id and (p_status<>'delivered' or status not in ('bounced','complained','suppressed'));
end; $$;
revoke all on function public.record_investment_newsletter_event(text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_investment_newsletter_event(text,uuid,text,timestamptz) to service_role;
