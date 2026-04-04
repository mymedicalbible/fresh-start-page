-- Quick symptom & activity logs (dashboard SymptomTracker + analytics queries)
-- MCAS episodes stay in mcas_episodes; this table is for structured multi-select symptom + activity snapshots.

create table public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_last_4h text,
  symptoms text[] not null default '{}',
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_symptom_logs_user_logged on public.symptom_logs (user_id, logged_at desc);

alter table public.symptom_logs enable row level security;

create policy "symptom_logs_own" on public.symptom_logs
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
