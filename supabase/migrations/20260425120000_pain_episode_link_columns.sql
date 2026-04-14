-- Bidirectional link when a pain log and symptom episode are logged together (same quick-log flow).
-- Enables correlation: co-occurring vs independent logs.

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
