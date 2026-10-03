begin;
-- Confine the larger statement budget to an immutable, bounded evidence freeze.
-- Ordinary REST reads/writes and the client request deadline stay unchanged.
create or replace function public.freeze_recommendation_input(p_manifest jsonb)
returns uuid language plpgsql security definer set search_path=public
set statement_timeout='25s' as $$
declare c jsonb; frozen_id uuid;
begin
  c := p_manifest->'content';
  if pg_column_size(p_manifest)>24*1024*1024
    or jsonb_typeof(c) is distinct from 'object'
    or jsonb_typeof(c->'names') is distinct from 'array'
    or c->>'id' is distinct from p_manifest->>'id'
    or c->>'ownerId' is distinct from p_manifest->>'owner_id'
    or c->>'date' is distinct from p_manifest->>'decision_date'
    or c->>'policy' is distinct from p_manifest->>'policy_version'
    or c->>'editionKey' is distinct from p_manifest->>'edition_key'
    or (c->>'cutoff')::timestamptz is distinct from (p_manifest->>'decision_cutoff')::timestamptz
    or coalesce(p_manifest->>'content_hash','') !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid bounded recommendation manifest'; end if;
  insert into public.recommendation_input_manifests
    (id,owner_id,decision_date,decision_cutoff,policy_version,edition_key,content_hash,content)
    values ((p_manifest->>'id')::uuid,(p_manifest->>'owner_id')::uuid,
      (p_manifest->>'decision_date')::date,(p_manifest->>'decision_cutoff')::timestamptz,
      p_manifest->>'policy_version',p_manifest->>'edition_key',p_manifest->>'content_hash',c)
    on conflict (owner_id,decision_date,policy_version,edition_key) do nothing
    returning id into frozen_id;
  if frozen_id is null then
    select id into strict frozen_id from public.recommendation_input_manifests
      where owner_id=(p_manifest->>'owner_id')::uuid
        and decision_date=(p_manifest->>'decision_date')::date
        and policy_version=p_manifest->>'policy_version'
        and edition_key=p_manifest->>'edition_key';
  end if;
  return frozen_id;
end; $$;
revoke all on function public.freeze_recommendation_input(jsonb) from public,anon,authenticated;
grant execute on function public.freeze_recommendation_input(jsonb) to service_role;
commit;
