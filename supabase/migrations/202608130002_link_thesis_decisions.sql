begin;

-- A capital decision is a separate, versioned action. Keep the evidence
-- lineage explicit so a decision cannot be mistaken for an unreviewed thesis
-- or a generic stock-page preference.
alter table public.thesis_decisions
  add column if not exists investment_thesis_id uuid
    references public.investment_theses(id) on delete set null;

create index if not exists thesis_decisions_owner_thesis_recent
  on public.thesis_decisions (owner_id, investment_thesis_id, created_at desc);

commit;
