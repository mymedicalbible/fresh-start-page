-- Trial: plushie tokens, ledger, weekly rotation (5 slots), purchase RPC
-- Earn: triggers on inserts + RPCs for handoff summary (cap 2/day) and transcript visit

-- ─── Catalog & config ─────────────────────────────────────────────────────
create table public.plushie_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  lottie_path text not null,
  slot_index int not null unique check (slot_index >= 0 and slot_index < 5)
);

insert into public.plushie_catalog (slug, name, lottie_path, slot_index) values
  ('panda-popcorn', 'Panda & popcorn', '/lottie/plushie-0.json', 0),
  ('rustle-plant', 'Rustle plant', '/lottie/plushie-1.json', 1),
  ('plushie-two', 'Plushie 3', '/lottie/plushie-2.json', 2),
  ('plushie-three', 'Plushie 4', '/lottie/plushie-3.json', 3),
  ('plushie-four', 'Plushie 5', '/lottie/plushie-4.json', 4);

create table public.game_config (
  key text primary key,
  value text not null
);

insert into public.game_config (key, value) values
  ('rotation_anchor', '2026-04-07'),
  ('enabled', 'true');

create table public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  reason text not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index idx_token_ledger_user on public.token_ledger (user_id);
create index idx_token_ledger_user_created on public.token_ledger (user_id, created_at desc);

create unique index uq_token_visit_complete on public.token_ledger (user_id, ref_id)
  where reason = 'visit_complete' and ref_id is not null;

create unique index uq_token_pain on public.token_ledger (user_id, ref_id)
  where reason = 'pain_entry' and ref_id is not null;

create unique index uq_token_episode on public.token_ledger (user_id, ref_id)
  where reason = 'episode_entry' and ref_id is not null;

create unique index uq_token_question on public.token_ledger (user_id, ref_id)
  where reason = 'question_entry' and ref_id is not null;

create unique index uq_token_transcript on public.token_ledger (user_id, ref_id)
  where reason = 'transcript_visit' and ref_id is not null;

create table public.user_plushie_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plushie_id uuid not null references public.plushie_catalog (id) on delete cascade,
  tokens_spent int not null,
  created_at timestamptz not null default now(),
  unique (user_id, plushie_id)
);

create index idx_unlocks_user on public.user_plushie_unlocks (user_id);

-- ─── Ledger helper (SECURITY DEFINER) ─────────────────────────────────────
create or replace function public.game_insert_token_ledger (
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_table text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_ledger (user_id, amount, reason, ref_table, ref_id)
  values (p_user_id, p_amount, p_reason, p_ref_table, p_ref_id);
exception
  when unique_violation then
    null;
end;
$$;

-- ─── Triggers: earn on insert ───────────────────────────────────────────────
create or replace function public.trg_grant_tokens_pain_insert ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_insert_token_ledger (new.user_id, 1, 'pain_entry', 'pain_entries', new.id);
  return new;
end;
$$;

create trigger pain_entries_game_tokens
  after insert on public.pain_entries
  for each row
  execute function public.trg_grant_tokens_pain_insert ();

create or replace function public.trg_grant_tokens_episode_insert ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_insert_token_ledger (new.user_id, 1, 'episode_entry', 'mcas_episodes', new.id);
  return new;
end;
$$;

create trigger mcas_episodes_game_tokens
  after insert on public.mcas_episodes
  for each row
  execute function public.trg_grant_tokens_episode_insert ();

create or replace function public.trg_grant_tokens_question_insert ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.game_insert_token_ledger (new.user_id, 1, 'question_entry', 'doctor_questions', new.id);
  return new;
end;
$$;

create trigger doctor_questions_game_tokens
  after insert on public.doctor_questions
  for each row
  execute function public.trg_grant_tokens_question_insert ();

create or replace function public.trg_grant_tokens_visit_complete ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'complete' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'complete' then
    return new;
  end if;
  perform public.game_insert_token_ledger (new.user_id, 2, 'visit_complete', 'doctor_visits', new.id);
  return new;
end;
$$;

create trigger doctor_visits_game_tokens
  after insert or update of status on public.doctor_visits
  for each row
  execute function public.trg_grant_tokens_visit_complete ();

-- ─── RPC: handoff summary — max 2 tokens per calendar day (UTC) ─────────────
create or replace function public.game_try_grant_handoff_summary_tokens ()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  today date := (timezone ('utc', now ()))::date;
  already int;
  grant_amt int;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(sum(amount), 0)
    into already
  from public.token_ledger
  where user_id = uid
    and reason = 'handoff_summary'
    and (created_at at time zone 'utc')::date = today;

  if already >= 2 then
    return json_build_object('ok', true, 'granted', 0, 'daily_cap', true);
  end if;

  grant_amt := 2 - already;
  insert into public.token_ledger (user_id, amount, reason, ref_table, ref_id)
  values (uid, grant_amt, 'handoff_summary', null, null);

  return json_build_object('ok', true, 'granted', grant_amt, 'daily_cap', false);
end;
$$;

-- ─── RPC: transcript visit — 3 tokens once per visit ────────────────────────
create or replace function public.game_grant_transcript_visit (p_visit_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  v record;
  content_len int;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if exists (
    select 1 from public.token_ledger
    where user_id = uid and reason = 'transcript_visit' and ref_id = p_visit_id
  ) then
    return json_build_object('ok', true, 'granted', 0, 'already_granted', true);
  end if;

  select * into v
  from public.doctor_visits
  where id = p_visit_id and user_id = uid;

  if not found then
    return json_build_object('ok', false, 'error', 'visit_not_found');
  end if;

  content_len :=
    length (coalesce (v.notes, '')) +
    length (coalesce (v.findings, '')) +
    length (coalesce (v.instructions, ''));

  if content_len < 20 then
    return json_build_object('ok', false, 'error', 'content_too_short');
  end if;

  insert into public.token_ledger (user_id, amount, reason, ref_table, ref_id)
  values (uid, 3, 'transcript_visit', 'doctor_visits', p_visit_id);

  return json_build_object('ok', true, 'granted', 3);
exception
  when unique_violation then
    return json_build_object('ok', true, 'granted', 0, 'already_granted', true);
end;
$$;

-- ─── RPC: balance + shop state ──────────────────────────────────────────────
create or replace function public.game_get_state ()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  bal int;
  anchor date;
  slot int;
  active_id uuid;
  unlocks int;
  next_price int;
  owned_active boolean;
  row_p record;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(sum(amount), 0) into bal from public.token_ledger where user_id = uid;

  select value::date into anchor from public.game_config where key = 'rotation_anchor';
  if anchor is null then
    anchor := current_date;
  end if;

  slot := mod ((current_date - anchor) / 7, 5);
  if slot < 0 then
    slot := slot + 5;
  end if;

  select * into row_p from public.plushie_catalog where slot_index = slot;
  if not found then
    return json_build_object('ok', false, 'error', 'no_plushie_for_slot');
  end if;
  active_id := row_p.id;

  select count(*) into unlocks from public.user_plushie_unlocks where user_id = uid;
  next_price := 10 + 2 * unlocks;

  select exists (
    select 1 from public.user_plushie_unlocks where user_id = uid and plushie_id = active_id
  ) into owned_active;

  return json_build_object(
    'ok', true,
    'balance', bal,
    'rotation_slot', slot,
    'active_plushie', json_build_object(
      'id', row_p.id,
      'slug', row_p.slug,
      'name', row_p.name,
      'lottie_path', row_p.lottie_path,
      'slot_index', row_p.slot_index
    ),
    'next_price', next_price,
    'unlock_count', unlocks,
    'owned_active', owned_active
  );
end;
$$;

create or replace function public.game_purchase_active_plushie ()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  bal int;
  anchor date;
  slot int;
  active_id uuid;
  unlocks int;
  price int;
  row_p record;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select value::date into anchor from public.game_config where key = 'rotation_anchor';
  if anchor is null then
    anchor := current_date;
  end if;

  slot := mod ((current_date - anchor) / 7, 5);
  if slot < 0 then
    slot := slot + 5;
  end if;

  select * into row_p from public.plushie_catalog where slot_index = slot;
  if not found then
    return json_build_object('ok', false, 'error', 'no_plushie_for_slot');
  end if;
  active_id := row_p.id;

  if exists (
    select 1 from public.user_plushie_unlocks where user_id = uid and plushie_id = active_id
  ) then
    return json_build_object('ok', false, 'error', 'already_owned');
  end if;

  select count(*) into unlocks from public.user_plushie_unlocks where user_id = uid;
  price := 10 + 2 * unlocks;

  select coalesce(sum(amount), 0) into bal from public.token_ledger where user_id = uid;

  if bal < price then
    return json_build_object('ok', false, 'error', 'insufficient_tokens', 'balance', bal, 'needed', price);
  end if;

  insert into public.token_ledger (user_id, amount, reason, ref_table, ref_id)
  values (uid, -price, 'plushie_purchase', 'plushie_catalog', active_id);

  insert into public.user_plushie_unlocks (user_id, plushie_id, tokens_spent)
  values (uid, active_id, price);

  return json_build_object('ok', true, 'spent', price, 'plushie_id', active_id, 'balance_after', bal - price);
exception
  when unique_violation then
    return json_build_object('ok', false, 'error', 'already_owned');
end;
$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.token_ledger enable row level security;
alter table public.user_plushie_unlocks enable row level security;
alter table public.plushie_catalog enable row level security;
alter table public.game_config enable row level security;

create policy token_ledger_select_own on public.token_ledger
  for select using (auth.uid () = user_id);

create policy user_plushie_unlocks_select_own on public.user_plushie_unlocks
  for select using (auth.uid () = user_id);

create policy plushie_catalog_read on public.plushie_catalog
  for select using (true);

create policy game_config_read on public.game_config
  for select using (true);

-- RPC for authenticated users
grant execute on function public.game_try_grant_handoff_summary_tokens () to authenticated;
grant execute on function public.game_grant_transcript_visit (uuid) to authenticated;
grant execute on function public.game_get_state () to authenticated;
grant execute on function public.game_purchase_active_plushie () to authenticated;
