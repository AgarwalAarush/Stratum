begin;
-- ETFs were introduced after the private-owner migration; keep the same registry.
insert into public.market_users(id,label)
select owner_id,'Imported ETF research owner' from (
 select owner_id from public.etf_research_packets union select owner_id from public.etf_research_notes
) existing on conflict(id) do nothing;
alter table public.etf_research_packets drop constraint if exists etf_research_packets_owner_id_fkey,
 add constraint etf_research_packets_owner_id_fkey foreign key(owner_id) references public.market_users(id) on delete restrict;
alter table public.etf_research_notes drop constraint if exists etf_research_notes_owner_id_fkey,
 add constraint etf_research_notes_owner_id_fkey foreign key(owner_id) references public.market_users(id) on delete restrict;
commit;
