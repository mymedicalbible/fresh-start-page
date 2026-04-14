-- Idempotent safety net: ensure RLS + per-user policies on mcas_symptom_logs and doctors
-- (covers partial migration history or manual drift).

do $$
begin
  if to_regclass('public.mcas_symptom_logs') is not null then
    execute 'alter table public.mcas_symptom_logs enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'mcas_symptom_logs'
        and policyname = 'mcas_symptom_logs_own'
    ) then
      create policy "mcas_symptom_logs_own" on public.mcas_symptom_logs
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
  end if;

  if to_regclass('public.doctors') is not null then
    execute 'alter table public.doctors enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'doctors'
        and policyname = 'doctors_own'
    ) then
      create policy "doctors_own" on public.doctors
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;
  end if;
end $$;
