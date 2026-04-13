-- When a diagnosis is marked Resolved or Ruled Out, store the date of that change.

alter table public.diagnoses_directory
  add column if not exists date_resolved date,
  add column if not exists date_ruled_out date;
