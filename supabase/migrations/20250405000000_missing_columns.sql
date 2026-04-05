-- Add status column to doctor_visits (pending / complete workflow)
alter table public.doctor_visits
  add column if not exists status text default 'complete';

update public.doctor_visits
  set status = 'complete'
  where status is null;

-- Add activity column to mcas_episodes (what were you doing before the episode)
alter table public.doctor_visits
  add column if not exists is_finalized boolean default true;

alter table public.mcas_episodes
  add column if not exists activity text;

-- Ensure doctors table exists (created outside initial migration in some deployments)
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  specialty text,
  phone text,
  address text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_doctors_user on public.doctors (user_id);

alter table public.doctors enable row level security;

drop policy if exists "doctors_own" on public.doctors;
create policy "doctors_own" on public.doctors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ensure tests_ordered table exists
create table if not exists public.tests_ordered (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  test_date date not null,
  doctor text,
  test_name text not null,
  reason text,
  status text default 'Pending',
  results text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_tests_user_date on public.tests_ordered (user_id, test_date desc);

alter table public.tests_ordered enable row level security;

drop policy if exists "tests_own" on public.tests_ordered;
create policy "tests_own" on public.tests_ordered
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
