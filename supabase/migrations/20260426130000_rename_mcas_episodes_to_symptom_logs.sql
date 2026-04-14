-- Rename MCAS "episode" storage to symptom-oriented names: table, date/time columns,
-- pain ↔ log link column, plushie token ledger rows, and earn trigger.
--
-- Idempotent: if public.mcas_symptom_logs already exists and mcas_episodes is gone,
-- the migration no-ops (safe for SQL Editor re-run or remote already migrated).

create or replace function public.__migration_rename_mcas_episodes_to_symptom_logs ()
returns void
language plpgsql
as $$
declare
  r record;
begin
  if to_regclass('public.mcas_episodes') is null then
    if to_regclass('public.mcas_symptom_logs') is not null then
      raise notice 'rename_mcas_episodes_to_symptom_logs: already applied, skipping.';
      return;
    end if;
    raise exception 'rename_mcas_episodes_to_symptom_logs: public.mcas_episodes not found (and mcas_symptom_logs missing). Apply earlier migrations first.'
      using hint = 'Run full supabase/migrations from 20250325000000_initial.sql onward, or use Supabase Dashboard → SQL Editor with this file.';
  end if;

  -- ─── 1) Stop earn trigger on old table name ─────────────────────────────
  execute 'drop trigger if exists mcas_episodes_game_tokens on public.mcas_episodes';

  -- ─── 2) Drop FK from pain_entries.linked_episode_id → mcas_episodes ─────
  for r in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_schema = kcu.constraint_schema
      and tc.constraint_name = kcu.constraint_name
      and tc.table_name = kcu.table_name
    where tc.table_schema = 'public'
      and tc.table_name = 'pain_entries'
      and kcu.column_name = 'linked_episode_id'
      and tc.constraint_type = 'FOREIGN KEY'
  loop
    execute format('alter table public.pain_entries drop constraint %I', r.constraint_name);
  end loop;

  -- ─── 3) Rename date/time columns then table ──────────────────────────────
  execute 'alter table public.mcas_episodes rename column episode_date to symptom_date';
  execute 'alter table public.mcas_episodes rename column episode_time to symptom_time';

  execute 'alter table public.mcas_episodes rename to mcas_symptom_logs';

  -- ─── 4) Rename pain link column and reattach FK ──────────────────────────
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pain_entries'
      and column_name = 'linked_episode_id'
  ) then
    execute 'alter table public.pain_entries rename column linked_episode_id to linked_symptom_log_id';
  end if;

  execute 'alter table public.pain_entries add column if not exists linked_symptom_log_id uuid';
  execute 'alter table public.mcas_symptom_logs add column if not exists linked_pain_entry_id uuid';

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pain_entries'
      and column_name = 'linked_symptom_log_id'
  ) and not exists (
    select 1 from pg_constraint where conname = 'pain_entries_linked_symptom_log_id_fkey'
  ) then
    execute $fk$
      alter table public.pain_entries
        add constraint pain_entries_linked_symptom_log_id_fkey
        foreign key (linked_symptom_log_id) references public.mcas_symptom_logs (id) on delete set null
    $fk$;
  end if;

  execute $c1$
    comment on column public.pain_entries.linked_symptom_log_id is
      'Set when the user logged a linked symptom log in the same quick-log session.'
  $c1$;
  execute $c2$
    comment on column public.mcas_symptom_logs.linked_pain_entry_id is
      'Set when this symptom log was saved together with a pain entry.'
  $c2$;

  if not exists (
    select 1 from pg_constraint where conname = 'mcas_symptom_logs_linked_pain_entry_id_fkey'
  ) then
    execute $fk2$
      alter table public.mcas_symptom_logs
        add constraint mcas_symptom_logs_linked_pain_entry_id_fkey
        foreign key (linked_pain_entry_id) references public.pain_entries (id) on delete set null
    $fk2$;
  end if;

  -- ─── 5) Rename indexes for clarity ───────────────────────────────────────
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'i' and c.relname = 'idx_mcas_user_date'
  ) then
    execute 'alter index public.idx_mcas_user_date rename to idx_mcas_symptom_logs_user_date';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'i' and c.relname = 'idx_pain_entries_linked_episode'
  ) then
    execute 'alter index public.idx_pain_entries_linked_episode rename to idx_pain_entries_linked_symptom_log';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'i' and c.relname = 'idx_mcas_episodes_linked_pain'
  ) then
    execute 'alter index public.idx_mcas_episodes_linked_pain rename to idx_mcas_symptom_logs_linked_pain';
  end if;

  -- ─── 6) RLS policy name (optional clarity) ───────────────────────────────
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'mcas_symptom_logs'
      and pol.polname = 'mcas_own'
  ) then
    execute 'alter policy "mcas_own" on public.mcas_symptom_logs rename to "mcas_symptom_logs_own"';
  end if;
end;
$$;

select public.__migration_rename_mcas_episodes_to_symptom_logs ();

drop function public.__migration_rename_mcas_episodes_to_symptom_logs ();

-- ─── 7) Plushie token ledger: new reason + ref_table; replace unique index ─
-- Runs only after the SELECT above succeeds (rename done, or already skipped with table present).
drop index if exists uq_token_episode;

update public.token_ledger
set reason = 'symptom_log_entry', ref_table = 'mcas_symptom_logs'
where reason = 'episode_entry'
  and (ref_table is null or ref_table = 'mcas_episodes');

create unique index if not exists uq_token_symptom_log on public.token_ledger (user_id, ref_id)
  where reason = 'symptom_log_entry' and ref_id is not null;

-- ─── 8) Recreate earn trigger on new table ────────────────────────────────
create or replace function public.trg_grant_tokens_symptom_log_insert ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_insert_token_ledger (new.user_id, 1, 'symptom_log_entry', 'mcas_symptom_logs', new.id);
  return new;
end;
$$;

drop trigger if exists mcas_symptom_logs_game_tokens on public.mcas_symptom_logs;

create trigger mcas_symptom_logs_game_tokens
  after insert on public.mcas_symptom_logs
  for each row
  execute function public.trg_grant_tokens_symptom_log_insert ();

drop function if exists public.trg_grant_tokens_episode_insert ();
