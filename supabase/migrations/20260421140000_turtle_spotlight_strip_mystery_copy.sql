-- Spotlight = slot for current local week; slot 0 = turtle. Strip "Mystery friend" from names.
-- Re-anchor so THIS ISO week maps to slot 0 (turtle) when migration runs (server CURRENT_DATE).

begin;

-- Slot 0: turtle — canonical art and display name (never mystery / placeholder copy).
update public.plushie_catalog
set
  slug = 'meditating-turtle',
  name = 'O''Neal the Om Turtle',
  lottie_path = '/lottie/meditating-turtle.json'
where slot_index = 0;

-- Remove Mystery friend / Coming soon strings (derive readable title from slug).
update public.plushie_catalog
set name = initcap(replace(slug, '-', ' '))
where slot_index > 0
  and (
    lower(trim(name)) in ('mystery friend', 'coming soon')
    or lower(trim(name)) like '%mystery%friend%'
  );

-- Align rotation phase: current week index mod 7 == 0 => spotlight is slot 0 (turtle).
update public.game_config
set value = to_char(
  (current_date - (extract(isodow from current_date)::int - 1) * interval '1 day')::date,
  'YYYY-MM-DD'
)
where key = 'rotation_anchor';

commit;
