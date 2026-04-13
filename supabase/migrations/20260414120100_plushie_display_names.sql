-- Display names for shop + collection only (stored in catalog; profile no longer shows these titles in UI)

update public.plushie_catalog
set name = 'Pops the Panda'
where slug = 'panda-popcorn';

update public.plushie_catalog
set name = 'Ollie the Om Turtle'
where slug = 'meditating-turtle';
