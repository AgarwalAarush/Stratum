begin;

-- Production inherited the research-notes table before migration history was
-- consolidated. Preserve the intended revision-link column without replaying
-- the older migration set against its already-owner-scoped schema.
alter table public.equity_research_notes
  add column if not exists previous_research_note_id uuid
  references public.equity_research_notes(id) on delete set null;

create index if not exists equity_research_previous_version
  on public.equity_research_notes (previous_research_note_id);

commit;
