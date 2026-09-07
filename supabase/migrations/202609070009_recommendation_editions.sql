-- Owner-requested updates are new immutable editions, never a rewrite of daily inputs.
alter table public.recommendation_input_manifests add column edition_key text not null default 'daily';
do $$ declare item record; begin
  for item in select conrelid::regclass as relation, conname from pg_constraint
    where conrelid in ('public.recommendation_input_manifests'::regclass, 'public.recommendation_batches'::regclass)
      and contype='u' and pg_get_constraintdef(oid)='UNIQUE (owner_id, decision_date, policy_version)'
  loop execute format('alter table %s drop constraint %I',item.relation,item.conname); end loop;
end $$;
alter table public.recommendation_input_manifests add constraint recommendation_manifest_edition_unique unique(owner_id,decision_date,policy_version,edition_key);
