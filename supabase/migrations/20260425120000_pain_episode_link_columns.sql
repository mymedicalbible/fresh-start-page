-- Bidirectional link when a pain log and symptom episode are logged together (same quick-log flow).
-- Enables correlation: co-occurring vs independent logs.
--
-- Remote DBs may already have renamed mcas_episodes → mcas_symptom_logs (e.g. 20260426130000 applied
-- out of order or manual). This migration must work in both cases.

do $migration$
begin
  if to_regclass('public.mcas_episodes') is not null then
    -- Pre-rename schema: table still named mcas_episodes, link column linked_episode_id
    alter table public.pain_entries
      add column if not exists linked_episode_id uuid references public.mcas_episodes (id) on delete set null;

    alter table public.mcas_episodes
      add column if not exists linked_pain_entry_id uuid references public.pain_entries (id) on delete set null;

    create index if not exists idx_pain_entries_linked_episode
      on public.pain_entries (user_id, linked_episode_id)
      where linked_episode_id is not null;

    create index if not exists idx_mcas_episodes_linked_pain
      on public.mcas_episodes (user_id, linked_pain_entry_id)
      where linked_pain_entry_id is not null;

    comment on column public.pain_entries.linked_episode_id is 'Set when user logged a linked MCAS episode in the same quick-log session.';
    comment on column public.mcas_episodes.linked_pain_entry_id is 'Set when this episode was logged together with a pain entry.';

  elsif to_regclass('public.mcas_symptom_logs') is not null then
    -- Already renamed: use final column names (matches post-20260426130000 schema)
    alter table public.pain_entries
      add column if not exists linked_symptom_log_id uuid references public.mcas_symptom_logs (id) on delete set null;

    alter table public.mcas_symptom_logs
      add column if not exists linked_pain_entry_id uuid references public.pain_entries (id) on delete set null;

    create index if not exists idx_pain_entries_linked_symptom_log
      on public.pain_entries (user_id, linked_symptom_log_id)
      where linked_symptom_log_id is not null;

    create index if not exists idx_mcas_symptom_logs_linked_pain
      on public.mcas_symptom_logs (user_id, linked_pain_entry_id)
      where linked_pain_entry_id is not null;

    comment on column public.pain_entries.linked_symptom_log_id is 'Set when the user logged a linked symptom log in the same quick-log session.';
    comment on column public.mcas_symptom_logs.linked_pain_entry_id is 'Set when this log was logged together with a pain entry.';

  else
    raise exception 'pain_episode_link_columns: neither public.mcas_episodes nor public.mcas_symptom_logs exists';
  end if;
end;
$migration$;
