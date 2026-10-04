begin;

-- Keep the original RPC available to the preceding worker during rollout.
-- New workers compare the host-validated predecessor under the same lock used
-- by the original promoter, so concurrent recovery cannot roll back cutover.
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

  -- Retrying the exact completed promotion is harmless, even if the original
  -- expected predecessor has since ceased to be current.
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
  update public.world_repository_projections set is_canonical = true
    where commit_sha = p_commit_sha returning * into promoted;
  return promoted;
end;
$$;

revoke all on function public.promote_world_repository_projection_if_current(text,text) from public, anon, authenticated;
grant execute on function public.promote_world_repository_projection_if_current(text,text) to service_role;

commit;
