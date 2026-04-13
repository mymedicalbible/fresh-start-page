-- Align rotation phase, neutral stub names, and expose next week's catalog row (gift box)
-- so spotlight = this week / box = next week — same 5-slot loop as game_get_state.

begin;

-- Phase the weekly rotation so the current ISO week (server date) maps to slot 0.
-- Client still supplies p_tz inside game_get_state; this anchor only fixes week index mod 5.
update public.game_config
set value = to_char(
  (current_date - (extract(isodow from current_date)::int - 1) * interval '1 day')::date,
  'YYYY-MM-DD'
)
where key = 'rotation_anchor';

update public.plushie_catalog
set name = 'Mystery friend'
where lower(trim(name)) = 'coming soon'
   or slug = 'coming-soon-slot-1';

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

  slot := mod ((week_monday - anchor_monday) / 7, 5);
  if slot < 0 then
    slot := slot + 5;
  end if;

  next_slot := mod (slot + 1, 5);

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

grant execute on function public.game_get_state (text) to authenticated;
