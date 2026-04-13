-- Seven weekly rotation slots (0–6): slot 0 stays O'Neal the turtle — not updated here.
-- Adds six new Lottie-backed plushies on slots 1–6; expands mod cycle from 5 to 7.

begin;

-- Allow slot_index 0..6
alter table public.plushie_catalog drop constraint if exists plushie_catalog_slot_index_check;
alter table public.plushie_catalog add constraint plushie_catalog_slot_index_check
  check (slot_index >= 0 and slot_index < 7);

-- Replace rotating lineup on slots 1–4 (same rows/UUIDs; user unlocks preserved).
update public.plushie_catalog
set
  slug = 'robot-says-hi',
  name = 'Robot Says Hi',
  lottie_path = '/lottie/robot-says-hi.json'
where slot_index = 1;

update public.plushie_catalog
set
  slug = 'fox-programmer',
  name = 'Fox Programmer',
  lottie_path = '/lottie/fox-programmer.json'
where slot_index = 2;

update public.plushie_catalog
set
  slug = 'sleeping-penguin',
  name = 'Sleeping Penguin',
  lottie_path = '/lottie/sleeping-penguin.json'
where slot_index = 3;

update public.plushie_catalog
set
  slug = 'petite-girafe',
  name = 'Petite Girafe',
  lottie_path = '/lottie/petite-girafe.json'
where slot_index = 4;

-- New slots (no row existed for 5–6)
insert into public.plushie_catalog (slug, name, lottie_path, slot_index) values
  ('happy-dog', 'Happy Dog', '/lottie/happy-dog.json', 5),
  ('my-octopus-teacher', 'My Octopus Teacher', '/lottie/my-octopus-teacher.json', 6);

-- Re-phase so the current ISO week maps to slot 0 (turtle) without editing slot 0 data.
update public.game_config
set value = to_char(
  (current_date - (extract(isodow from current_date)::int - 1) * interval '1 day')::date,
  'YYYY-MM-DD'
)
where key = 'rotation_anchor';

commit;

create or replace function public.game_get_state (p_tz text default 'UTC')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  bal int;
  anchor date;
  v_tz text;
  local_date date;
  week_monday date;
  anchor_monday date;
  slot int;
  next_slot int;
  active_id uuid;
  unlocks int;
  next_price int;
  owned_active boolean;
  row_p record;
  row_next record;
  price_override text;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(sum(amount), 0) into bal from public.token_ledger where user_id = uid;

  v_tz := trim(coalesce(p_tz, 'UTC'));
  if v_tz !~ '^[A-Za-z0-9_/+-]+$' or length(v_tz) > 64 then
    v_tz := 'UTC';
  end if;

  begin
    local_date := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    local_date := (now() at time zone 'UTC')::date;
  end;

  select value::date into anchor from public.game_config where key = 'rotation_anchor';
  if anchor is null then
    anchor := local_date;
  end if;

  week_monday := local_date - (extract(isodow from local_date)::int - 1);
  anchor_monday := anchor - (extract(isodow from anchor)::int - 1);

  slot := mod ((week_monday - anchor_monday) / 7, 7);
  if slot < 0 then
    slot := slot + 7;
  end if;

  next_slot := mod (slot + 1, 7);

  select * into row_p from public.plushie_catalog where slot_index = slot;
  if not found then
    return json_build_object('ok', false, 'error', 'no_plushie_for_slot');
  end if;
  active_id := row_p.id;

  select * into row_next from public.plushie_catalog where slot_index = next_slot;
  if not found then
    return json_build_object('ok', false, 'error', 'no_plushie_for_slot');
  end if;

  select count(*) into unlocks from public.user_plushie_unlocks where user_id = uid;

  select value into price_override from public.game_config where key = 'fixed_plushie_price';
  if price_override is not null and trim(price_override) <> '' then
    next_price := trim(price_override)::int;
  else
    next_price := 10 + 2 * unlocks;
  end if;

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
    'next_week_plushie', json_build_object(
      'id', row_next.id,
      'slug', row_next.slug,
      'name', row_next.name,
      'lottie_path', row_next.lottie_path,
      'slot_index', row_next.slot_index
    ),
    'next_price', next_price,
    'unlock_count', unlocks,
    'owned_active', owned_active
  );
end;
$$;

create or replace function public.game_purchase_active_plushie (p_tz text default 'UTC')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  bal int;
  anchor date;
  v_tz text;
  local_date date;
  week_monday date;
  anchor_monday date;
  slot int;
  active_id uuid;
  unlocks int;
  price int;
  row_p record;
  price_override text;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_tz := trim(coalesce(p_tz, 'UTC'));
  if v_tz !~ '^[A-Za-z0-9_/+-]+$' or length(v_tz) > 64 then
    v_tz := 'UTC';
  end if;

  begin
    local_date := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    local_date := (now() at time zone 'UTC')::date;
  end;

  select value::date into anchor from public.game_config where key = 'rotation_anchor';
  if anchor is null then
    anchor := local_date;
  end if;

  week_monday := local_date - (extract(isodow from local_date)::int - 1);
  anchor_monday := anchor - (extract(isodow from anchor)::int - 1);

  slot := mod ((week_monday - anchor_monday) / 7, 7);
  if slot < 0 then
    slot := slot + 7;
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

  select value into price_override from public.game_config where key = 'fixed_plushie_price';
  if price_override is not null and trim(price_override) <> '' then
    price := trim(price_override)::int;
  else
    price := 10 + 2 * unlocks;
  end if;

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

grant execute on function public.game_get_state (text) to authenticated;
grant execute on function public.game_purchase_active_plushie (text) to authenticated;
