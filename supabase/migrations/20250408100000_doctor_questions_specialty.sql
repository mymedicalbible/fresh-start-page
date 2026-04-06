-- Optional specialty when question is tied to a doctor (especially free-text "new" doctor)

alter table public.doctor_questions
  add column if not exists doctor_specialty text;

comment on column public.doctor_questions.doctor_specialty is 'Optional specialty for the doctor on this question (e.g. when doctor is not in doctors list)';
