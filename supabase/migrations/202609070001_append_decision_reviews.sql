-- Review history is evidence; a follow-up review must not overwrite it.
alter table public.decision_reviews drop constraint if exists decision_reviews_owner_id_decision_id_key;
create or replace function public.reject_investment_evidence_mutation() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'Investment evidence is append-only; publish a correction'; end;
$$;
create trigger decision_reviews_immutable before update or delete on public.decision_reviews
for each row execute function public.reject_investment_evidence_mutation();
create index if not exists decision_reviews_history on public.decision_reviews(owner_id, decision_id, reviewed_at desc);
