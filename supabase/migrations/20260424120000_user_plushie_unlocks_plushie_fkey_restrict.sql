-- Unlock rows must not disappear when catalog rows are deleted/reseeded (was ON DELETE CASCADE).
alter table public.user_plushie_unlocks
  drop constraint if exists user_plushie_unlocks_plushie_id_fkey;

alter table public.user_plushie_unlocks
  add constraint user_plushie_unlocks_plushie_id_fkey
    foreign key (plushie_id)
    references public.plushie_catalog (id)
    on delete restrict;
