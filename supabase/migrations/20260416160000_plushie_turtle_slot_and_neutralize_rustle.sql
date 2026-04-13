-- Guarantee Ollie the turtle stays on weekly rotation slot 0, and remove any remaining
-- trial "rustle-plant" row from showing that name in RPC-driven shop state.

begin;

update public.plushie_catalog
set
  slug = 'meditating-turtle',
  name = 'Ollie the Om Turtle',
  lottie_path = '/lottie/meditating-turtle.json'
where slot_index = 0;

update public.plushie_catalog
set
  slug = 'coming-soon-slot-1',
  name = 'Coming soon'
where lower(slug) = 'rustle-plant';

commit;
