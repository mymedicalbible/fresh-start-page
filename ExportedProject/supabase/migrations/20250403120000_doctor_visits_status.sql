-- Pending / complete visit workflow
alter table public.doctor_visits
  add column if not exists status text default 'complete';

update public.doctor_visits
  set status = 'complete'
  where status is null;

comment on column public.doctor_visits.status is 'complete | pending — pending visits can be finished later';
