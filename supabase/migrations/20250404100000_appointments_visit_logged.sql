-- Upcoming appointments + dashboard banner (visit_logged)
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doctor text,
  specialty text,
  appointment_date date not null,
  appointment_time text,
  visit_logged boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_appointments_user_date on public.appointments (user_id, appointment_date);

alter table public.appointments
  add column if not exists visit_logged boolean default false;

alter table public.appointments enable row level security;

drop policy if exists "appointments_own" on public.appointments;
create policy "appointments_own" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.appointments.visit_logged is 'True after a visit on/around this appointment has been logged';
