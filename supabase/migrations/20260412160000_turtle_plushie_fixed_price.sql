-- Meditating Turtle as active catalog entry (slot 0) + fixed 25-token price for current plushie trial

insert into public.game_config (key, value)
values ('fixed_plushie_price', '25')
on conflict (key) do update set value = excluded.value;

update public.plushie_catalog
set
  slug = 'meditating-turtle',
  name = 'Meditating Turtle',
  lottie_path = '/lottie/meditating-turtle.json'
where slot_index = 0;

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
  price_override text;
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
  price_override text;
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
