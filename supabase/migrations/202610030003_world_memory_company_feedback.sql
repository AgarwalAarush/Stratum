begin;
-- Canonical claim history references existing immutable observations/documents.
create table public.world_claim_revisions (
 revision_id text primary key, claim_id text not null, node_id text not null,
 content jsonb not null, sources jsonb not null default '[]', evidence_origins jsonb not null default '[]',
 accepted_at timestamptz not null default now()
);
create index world_claim_identity_history on public.world_claim_revisions(claim_id,accepted_at);
create trigger world_claim_revision_immutable before update or delete on public.world_claim_revisions
 for each row execute function public.prevent_world_evidence_mutation();
create table public.world_memory_snapshots (
 commit_sha text primary key, branch text not null, accepted_at timestamptz not null default now(), sources jsonb not null
);
create index world_memory_knowledge_time on public.world_memory_snapshots(accepted_at desc);
create table public.world_claim_memberships (
 commit_sha text not null references public.world_memory_snapshots(commit_sha), node_id text not null,
 claim_id text not null, revision_id text not null references public.world_claim_revisions(revision_id),
 primary key(commit_sha,node_id,claim_id)
);
create trigger world_memory_snapshot_immutable before update or delete on public.world_memory_snapshots
 for each row execute function public.prevent_world_evidence_mutation();
create trigger world_claim_membership_immutable before update or delete on public.world_claim_memberships
 for each row execute function public.prevent_world_evidence_mutation();
create table public.world_claim_observation_links (
 revision_id text not null references public.world_claim_revisions(revision_id),
 observation_id uuid not null references public.world_observations(id),
 primary key(revision_id,observation_id)
);
create trigger world_claim_observation_immutable before update or delete on public.world_claim_observation_links
 for each row execute function public.prevent_world_evidence_mutation();
create or replace function public.publish_world_memory_snapshot(p_commit text,p_branch text,p_sources jsonb,p_claims jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare c jsonb; observation text;
begin
 perform pg_advisory_xact_lock(hashtext('world-memory-snapshot'));
 if exists(select 1 from world_memory_snapshots where commit_sha=p_commit) then return; end if;
 insert into world_memory_snapshots(commit_sha,branch,sources) values(p_commit,p_branch,p_sources);
 for c in select value from jsonb_array_elements(p_claims) loop
  insert into world_claim_revisions(revision_id,claim_id,node_id,content,sources,evidence_origins)
   values(c->>'revision_id',c->>'claim_id',c->>'node_id',c->'content',c->'sources',c->'evidence_origins') on conflict do nothing;
  for observation in select jsonb_array_elements_text(coalesce(c->'content'->'observationIds','[]'::jsonb)) loop
   insert into world_claim_observation_links values(c->>'revision_id',observation::uuid) on conflict do nothing;
  end loop;
  insert into world_claim_memberships values(p_commit,c->>'node_id',c->>'claim_id',c->>'revision_id');
 end loop;
end $$;

create table public.company_world_memory_receipts (
 report_id uuid primary key references public.equity_research_notes(id) on delete restrict,
 owner_id uuid not null, symbol text not null, origin text not null check(origin in ('live','backfill')),
 status text not null default 'pending' check(status in ('pending','reviewing','applied','no_change','blocked','failed')),
 originating_lead_id text, job_id uuid references public.agent_jobs(id), run_id uuid references public.world_thinker_runs(id),
 result_commit text, context_node_ids jsonb not null default '[]', affected_node_ids jsonb not null default '[]', affected_claim_ids jsonb not null default '[]',
 explanation text, evidence_gaps jsonb not null default '[]', attempts integer not null default 0,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 updated_at timestamptz not null default now()
);
create index company_world_pending on public.company_world_memory_receipts(origin,created_at) where status in ('pending','reviewing');
create index company_world_owner on public.company_world_memory_receipts(owner_id,symbol);
-- Full prose is an owner-scoped, rebuildable search projection, never World evidence.
create table public.company_research_search_index (
 report_id uuid primary key references public.equity_research_notes(id) on delete cascade,
 owner_id uuid not null, symbol text not null, version integer not null, data_as_of timestamptz not null,
 generated_at timestamptz not null, indexed_at timestamptz not null default now(),
 search_text text not null, search_vector tsvector generated always as(to_tsvector('english',search_text)) stored
);
create index company_report_search on public.company_research_search_index using gin(search_vector);
create index company_report_search_owner on public.company_research_search_index(owner_id,symbol);
create or replace function public.index_company_world_report(p_report uuid,p_origin text default 'live')
returns void language plpgsql security definer set search_path=public as $$
declare n public.equity_research_notes;
begin
 select * into n from equity_research_notes where id=p_report and status='complete';
 if n.id is null then raise exception 'Completed equity report required'; end if;
 insert into company_research_search_index(report_id,owner_id,symbol,version,data_as_of,generated_at,search_text)
 values(n.id,n.owner_id,n.symbol,n.version,n.data_as_of,n.generated_at,n.symbol||' '||coalesce(n.content::text,''))
 on conflict(report_id) do nothing;
 insert into company_world_memory_receipts(report_id,owner_id,symbol,origin,originating_lead_id,context_node_ids)
 values(n.id,n.owner_id,n.symbol,p_origin,n.content->'worldContextOrigin'->>'id',coalesce(n.content->'worldMemoryPreparation'->'retrievalReceipt'->'nodeIds','[]'::jsonb)) on conflict(report_id) do nothing;
end $$;
create or replace function public.on_company_world_report_complete() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='complete' and (tg_op='INSERT' or old.status is distinct from 'complete') then
  perform index_company_world_report(new.id,'live');
 end if; return new;
end $$;
create trigger company_world_report_complete after insert or update of status on public.equity_research_notes
 for each row execute function public.on_company_world_report_complete();
create or replace function public.backfill_company_world_reports() returns jsonb
language plpgsql security definer set search_path=public as $$
declare n record; selected integer:=0; receipts integer; indexed integer;
begin
 for n in select distinct on(owner_id,symbol) id from equity_research_notes where status='complete'
  order by owner_id,symbol,version desc,generated_at desc,id loop
  perform index_company_world_report(n.id,'backfill'); selected:=selected+1;
 end loop;
 select count(*) into receipts from company_world_memory_receipts where origin='backfill';
 select count(*) into indexed from company_research_search_index;
 return jsonb_build_object('selected',selected,'backfillReceipts',receipts,'indexedReports',indexed);
end $$;
create or replace function public.claim_company_world_receipt(p_report uuid,p_job uuid) returns setof public.company_world_memory_receipts
language plpgsql security definer set search_path=public as $$
begin
 return query update company_world_memory_receipts set status='reviewing',job_id=p_job,attempts=attempts+1,
 started_at=now(),finished_at=null,updated_at=now(),explanation=null
 where report_id=p_report and (status in ('pending','failed') or (status='reviewing' and job_id=p_job)) returning *;
end $$;
-- Service-only functions and RLS protect reports even when a private owner is not auth.users.
alter table public.world_claim_revisions enable row level security;
alter table public.world_claim_observation_links enable row level security;
alter table public.world_memory_snapshots enable row level security;
alter table public.world_claim_memberships enable row level security;
alter table public.company_world_memory_receipts enable row level security;
alter table public.company_research_search_index enable row level security;
revoke all on function public.publish_world_memory_snapshot(text,text,jsonb,jsonb), public.index_company_world_report(uuid,text),
 public.backfill_company_world_reports(),public.claim_company_world_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_world_memory_snapshot(text,text,jsonb,jsonb), public.index_company_world_report(uuid,text),
 public.backfill_company_world_reports(),public.claim_company_world_receipt(uuid,uuid) to service_role;
commit;
