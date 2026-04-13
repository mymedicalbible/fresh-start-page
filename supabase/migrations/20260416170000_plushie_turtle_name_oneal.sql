-- Display name for the meditating turtle (catalog + future deploys)

update public.plushie_catalog
set name = 'O''Neal the Om Turtle'
where slug = 'meditating-turtle';
