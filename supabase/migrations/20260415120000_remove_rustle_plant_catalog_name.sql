-- Replace trial seed row "Rustle plant" (slot 1) with neutral copy; no placeholder branding in UI.

update public.plushie_catalog
set
  slug = 'coming-soon-slot-1',
  name = 'Coming soon'
where slug = 'rustle-plant';
