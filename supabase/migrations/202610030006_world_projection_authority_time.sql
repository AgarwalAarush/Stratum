begin;

-- Projection storage and canonical authority become available at different
-- times when a previously shadow-only commit is promoted.
alter table public.world_repository_projections
  add column if not exists canonical_promoted_at timestamptz;

-- The original promotion time was not recorded. Conservatively start authority
-- now instead of inferring that an existing shadow projection was canonical.
update public.world_repository_projections
  set canonical_promoted_at = clock_timestamp()
  where is_canonical and canonical_promoted_at is null;

create or replace function public.promote_world_repository_projection_if_current(
  p_commit_sha text,
  p_expected_current_commit_sha text
)
returns public.world_repository_projections
language plpgsql
security definer
set search_path = public
as $$
declare
  current_commit text;
  promoted public.world_repository_projections;
begin
  perform pg_advisory_xact_lock(hashtextextended('world-repository-projection', 0));
  select commit_sha into current_commit
    from public.world_repository_projections where is_canonical;
  if current_commit = p_commit_sha then
    select * into promoted from public.world_repository_projections
      where commit_sha = p_commit_sha;
    return promoted;
  end if;
  if current_commit is distinct from p_expected_current_commit_sha then
    raise exception 'Canonical World changed before promotion; retry against the current accepted commit'
      using errcode = '40001';
  end if;
  if not exists (select 1 from public.world_repository_projections where commit_sha = p_commit_sha) then
    raise exception 'World projection does not exist';
  end if;
  update public.world_repository_projections set is_canonical = false where is_canonical;
  update public.world_repository_projections
    set is_canonical = true, canonical_promoted_at = clock_timestamp()
    where commit_sha = p_commit_sha returning * into promoted;
  return promoted;
end;
$$;

-- Preserve compatibility for the preceding worker while recording actual
-- authority time. Current runtime callers use the checked RPC above.
create or replace function public.promote_world_repository_projection(p_commit_sha text)
returns public.world_repository_projections
language plpgsql
security definer
set search_path = public
as $$
declare promoted public.world_repository_projections;
begin
  perform pg_advisory_xact_lock(hashtextextended('world-repository-projection', 0));
  select * into promoted from public.world_repository_projections
    where commit_sha = p_commit_sha;
  if not found then
    raise exception 'World projection does not exist';
  end if;
  if promoted.is_canonical then return promoted; end if;
  update public.world_repository_projections set is_canonical = false where is_canonical;
  update public.world_repository_projections
    set is_canonical = true, canonical_promoted_at = clock_timestamp()
    where commit_sha = p_commit_sha returning * into promoted;
  return promoted;
end;
$$;

revoke all on function public.promote_world_repository_projection_if_current(text,text) from public, anon, authenticated;
grant execute on function public.promote_world_repository_projection_if_current(text,text) to service_role;
revoke all on function public.promote_world_repository_projection(text) from public, anon, authenticated;
grant execute on function public.promote_world_repository_projection(text) to service_role;

commit;
