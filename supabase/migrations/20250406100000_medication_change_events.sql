-- Log medication starts, dose/frequency adjustments, and stops for handoff correlation (pain & symptoms before/after).
-- Populated automatically via triggers on current_medications; no separate UI required for basic change capture.

create table if not exists public.medication_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_date date not null,
  medication text not null,
  event_type text not null check (event_type in ('start', 'adjustment', 'stop')),
  dose_previous text,
  dose_new text,
  frequency_previous text,
  frequency_new text,
  created_at timestamptz default now()
);

create index if not exists idx_med_change_events_user_date
  on public.medication_change_events (user_id, event_date desc);

alter table public.medication_change_events enable row level security;

drop policy if exists "medication_change_events_own" on public.medication_change_events;
create policy "medication_change_events_own" on public.medication_change_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.log_medication_change_event ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
begin
  if tg_op = 'INSERT' then
    d := coalesce(new.start_date, (current_timestamp at time zone 'utc')::date);
    insert into public.medication_change_events (
      user_id, event_date, medication, event_type, dose_new, frequency_new
    ) values (
      new.user_id, d, new.medication, 'start', new.dose, new.frequency
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.dose is not distinct from new.dose)
       and (old.frequency is not distinct from new.frequency)
       and (old.medication is not distinct from new.medication) then
      return new;
    end if;
    d := (current_timestamp at time zone 'utc')::date;
    insert into public.medication_change_events (
      user_id, event_date, medication, event_type,
      dose_previous, dose_new, frequency_previous, frequency_new
    ) values (
      new.user_id, d, new.medication, 'adjustment',
      old.dose, new.dose, old.frequency, new.frequency
    );
    return new;
  elsif tg_op = 'DELETE' then
    d := (current_timestamp at time zone 'utc')::date;
    insert into public.medication_change_events (
      user_id, event_date, medication, event_type, dose_previous, frequency_previous
    ) values (
      old.user_id, d, old.medication, 'stop', old.dose, old.frequency
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_current_medications_change_log on public.current_medications;
create trigger trg_current_medications_change_log
  after insert or update or delete on public.current_medications
  for each row execute function public.log_medication_change_event();

comment on table public.medication_change_events is 'Audit of med starts/adjustments/stops for correlating with pain and symptom trends';
