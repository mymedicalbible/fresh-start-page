-- Medical Tracker: multi-user schema with RLS
-- Run via Supabase CLI or SQL Editor

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  browser_push_enabled boolean default false,
  high_pain_alert boolean default true,
  appointment_reminders boolean default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz default now()
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  notification_type text default 'info' check (notification_type in ('info', 'warning', 'reminder', 'ai')),
  read_at timestamptz,
  created_at timestamptz default now()
);

create index idx_user_notifications_user_unread on public.user_notifications (user_id, created_at desc)
  where read_at is null;

create table public.doctor_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  visit_date date not null,
  visit_time text,
  doctor text,
  specialty text,
  reason text,
  findings text,
  tests_ordered text,
  new_meds text,
  med_changes text,
  instructions text,
  follow_up text,
  notes text,
  created_at timestamptz default now()
);

create index idx_doctor_visits_user_date on public.doctor_visits (user_id, visit_date desc);

create table public.med_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction_date date not null,
  reaction_time text,
  medication text not null,
  dose text,
  reaction text not null,
  severity text,
  duration text,
  helped_harmed text,
  effect_score int check (effect_score is null or (effect_score >= 1 and effect_score <= 10)),
  notes text,
  created_at timestamptz default now()
);

create index idx_med_reactions_user_date on public.med_reactions (user_id, reaction_date desc);
create index idx_med_reactions_user_med on public.med_reactions (user_id, medication);

create table public.mcas_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_date date not null,
  episode_time text,
  trigger text not null,
  symptoms text not null,
  onset text,
  severity text,
  relief text,
  notes text,
  medications_taken text,
  created_at timestamptz default now()
);

create index idx_mcas_user_date on public.mcas_episodes (user_id, episode_date desc);

create table public.current_medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medication text not null,
  dose text,
  frequency text,
  start_date date,
  purpose text,
  effectiveness text,
  side_effects text,
  notes text,
  updated_at timestamptz default now(),
  unique (user_id, medication)
);

create index idx_current_meds_user on public.current_medications (user_id);

create table public.diagnosis_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_date date not null,
  diagnoses_mentioned text,
  diagnoses_ruled_out text,
  doctor text,
  notes text,
  created_at timestamptz default now()
);

create table public.doctor_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date_created date not null,
  appointment_date date,
  doctor text,
  question text not null,
  priority text default 'Medium',
  category text,
  answer text,
  status text default 'Unanswered',
  created_at timestamptz default now()
);

create index idx_questions_user_status on public.doctor_questions (user_id, status);

create table public.pain_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  entry_time text,
  location text,
  intensity int check (intensity is null or (intensity >= 0 and intensity <= 10)),
  pain_type text,
  triggers text,
  relief_methods text,
  medications_taken text,
  notes text,
  created_at timestamptz default now()
);

create index idx_pain_user_date on public.pain_entries (user_id, entry_date desc);

-- Trigger: new auth user → profile + notification prefs
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user ();

-- RLS
alter table public.profiles enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_notifications enable row level security;
alter table public.doctor_visits enable row level security;
alter table public.med_reactions enable row level security;
alter table public.mcas_episodes enable row level security;
alter table public.current_medications enable row level security;
alter table public.diagnosis_notes enable row level security;
alter table public.doctor_questions enable row level security;
alter table public.pain_entries enable row level security;

create policy "profiles_own" on public.profiles
  for all using (auth.uid () = id) with check (auth.uid () = id);

create policy "notif_prefs_own" on public.notification_preferences
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "notifications_own" on public.user_notifications
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "doctor_visits_own" on public.doctor_visits
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "med_reactions_own" on public.med_reactions
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "mcas_own" on public.mcas_episodes
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "current_meds_own" on public.current_medications
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "diagnosis_own" on public.diagnosis_notes
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "questions_own" on public.doctor_questions
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "pain_own" on public.pain_entries
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- Realtime: new notification rows
alter publication supabase_realtime add table public.user_notifications;
