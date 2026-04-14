-- Rename MCAS "episode" storage to symptom-oriented names: table, date/time columns,
-- pain ↔ log link column, plushie token ledger rows, and earn trigger.

-- ─── 1) Stop earn trigger on old table name ─────────────────────────────────
drop trigger if exists mcas_episodes_game_tokens on public.mcas_episodes;

-- ─── 2) Drop FK from pain_entries.linked_episode_id → mcas_episodes ───────
do $$
declare
  r record;
begin
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
end $$;

-- ─── 3) Rename date/time columns then table ────────────────────────────────
alter table public.mcas_episodes rename column episode_date to symptom_date;
alter table public.mcas_episodes rename column episode_time to symptom_time;

alter table public.mcas_episodes rename to mcas_symptom_logs;

-- ─── 4) Rename pain link column and reattach FK ────────────────────────────
alter table public.pain_entries rename column linked_episode_id to linked_symptom_log_id;

alter table public.pain_entries
  add constraint pain_entries_linked_symptom_log_id_fkey
  foreign key (linked_symptom_log_id) references public.mcas_symptom_logs (id) on delete set null;

comment on column public.pain_entries.linked_symptom_log_id is
  'Set when the user logged a linked symptom log in the same quick-log session.';
comment on column public.mcas_symptom_logs.linked_pain_entry_id is
  'Set when this symptom log was saved together with a pain entry.';

-- ─── 5) Rename indexes for clarity ───────────────────────────────────────────
alter index if exists idx_mcas_user_date rename to idx_mcas_symptom_logs_user_date;
alter index if exists idx_pain_entries_linked_episode rename to idx_pain_entries_linked_symptom_log;
alter index if exists idx_mcas_episodes_linked_pain rename to idx_mcas_symptom_logs_linked_pain;

-- ─── 6) RLS policy name (optional clarity) ─────────────────────────────────
alter policy "mcas_own" on public.mcas_symptom_logs rename to "mcas_symptom_logs_own";

-- ─── 7) Plushie token ledger: new reason + ref_table; replace unique index ───
drop index if exists uq_token_episode;

update public.token_ledger
set reason = 'symptom_log_entry', ref_table = 'mcas_symptom_logs'
where reason = 'episode_entry'
  and (ref_table is null or ref_table = 'mcas_episodes');

create unique index uq_token_symptom_log on public.token_ledger (user_id, ref_id)
  where reason = 'symptom_log_entry' and ref_id is not null;

-- ─── 8) Recreate earn trigger on new table ─────────────────────────────────
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

create trigger mcas_symptom_logs_game_tokens
  after insert on public.mcas_symptom_logs
  for each row
  execute function public.trg_grant_tokens_symptom_log_insert ();

drop function if exists public.trg_grant_tokens_episode_insert ();
