-- Structured context for diagnoses_directory: how/why, treatment plan, care plan.
-- Migrates legacy `notes` into `care_plan`.

alter table public.diagnoses_directory
  add column if not exists how_or_why text,
  add column if not exists treatment_plan text,
  add column if not exists care_plan text;

update public.diagnoses_directory
set care_plan = notes
where care_plan is null and notes is not null;

alter table public.diagnoses_directory drop column if exists notes;
