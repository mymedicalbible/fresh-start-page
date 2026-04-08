-- Link doctor_questions rows created from the visit wizard to a visit (enables replace-on-save, no duplicates)
alter table public.doctor_questions
  add column if not exists doctor_visit_id uuid references public.doctor_visits (id) on delete set null;

create index if not exists idx_doctor_questions_doctor_visit_id
  on public.doctor_questions (doctor_visit_id)
  where doctor_visit_id is not null;

comment on column public.doctor_questions.doctor_visit_id is 'When set, questions were added from visit wizard step 2 for this visit row.';
