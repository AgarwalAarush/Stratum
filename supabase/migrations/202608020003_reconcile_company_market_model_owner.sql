begin;

alter table public.company_market_models
  drop constraint if exists company_market_models_owner_id_fkey,
  add constraint company_market_models_owner_id_fkey
    foreign key (owner_id) references public.market_users(id) on delete cascade;

commit;
