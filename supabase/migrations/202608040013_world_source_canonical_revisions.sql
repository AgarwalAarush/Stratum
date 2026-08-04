begin;

-- The canonical fetch target is part of a source's governance boundary. Keep
-- every human-targeted correction immutable and atomically paired with the
-- registry change so a broken landing page can be remediated without silently
-- widening the active contract.
create table if not exists public.world_source_canonical_revisions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.world_source_registry(id) on delete restrict,
  reviewer_id uuid not null references public.market_users(id) on delete restrict,
  previous_canonical_url text not null,
  canonical_url text not null,
  rationale text not null,
  revised_at timestamptz not null default now()
);

create index if not exists world_source_canonical_revisions_source_time
  on public.world_source_canonical_revisions (source_id, revised_at desc);

create or replace function public.revise_world_source_canonical_url(
  p_source_id uuid,
  p_reviewer_id uuid,
  p_canonical_url text,
  p_rationale text
)
returns public.world_source_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  current_source public.world_source_registry;
  revised_source public.world_source_registry;
begin
  if nullif(btrim(p_canonical_url), '') is null or nullif(btrim(p_rationale), '') is null then
    raise exception 'A canonical URL and revision rationale are required';
  end if;
  select * into current_source from public.world_source_registry where id = p_source_id for update;
  if current_source.id is null then raise exception 'Unknown source'; end if;
  if current_source.status not in ('approved', 'probation') then
    raise exception 'Only admitted sources may revise a canonical URL';
  end if;
  insert into public.world_source_canonical_revisions (
    source_id, reviewer_id, previous_canonical_url, canonical_url, rationale
  ) values (
    p_source_id, p_reviewer_id, current_source.canonical_url, btrim(p_canonical_url), btrim(p_rationale)
  );
  update public.world_source_registry
  set canonical_url = btrim(p_canonical_url), updated_at = now()
  where id = p_source_id
  returning * into revised_source;
  return revised_source;
end;
$$;

revoke all on function public.revise_world_source_canonical_url(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.revise_world_source_canonical_url(uuid, uuid, text, text) to service_role;

alter table public.world_source_canonical_revisions enable row level security;

commit;
