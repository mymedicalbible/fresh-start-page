-- Web push subscriptions + reminder dedupe log.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  notifications_enabled boolean not null default true,
  appointment_reminders_enabled boolean not null default true,
  daily_nudge_enabled boolean not null default true,
  daily_nudge_time_local time,
  timezone text,
  timezone_offset_minutes integer,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

create index if not exists idx_push_subscriptions_enabled
  on public.push_subscriptions (notifications_enabled, appointment_reminders_enabled, daily_nudge_enabled);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_reminder_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('pre_appt_questions', 'post_appt_pending', 'daily_log_nudge')),
  dedupe_key text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_push_reminder_dispatch_dedupe
  on public.push_reminder_dispatch_log (subscription_id, dedupe_key);

create index if not exists idx_push_reminder_dispatch_user_sent
  on public.push_reminder_dispatch_log (user_id, sent_at desc);

alter table public.push_reminder_dispatch_log enable row level security;

drop policy if exists "push_reminder_dispatch_log_own_read" on public.push_reminder_dispatch_log;
create policy "push_reminder_dispatch_log_own_read" on public.push_reminder_dispatch_log
  for select using (auth.uid() = user_id);
