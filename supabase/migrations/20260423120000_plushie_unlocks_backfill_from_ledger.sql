-- Repair user_plushie_unlocks from token_ledger (authoritative purchase record).
-- Fixes cases where unlock rows were missing while plushie_purchase debits still exist
-- (e.g. older RPC behavior, manual DB edits, or drift).

-- One-time backfill for all users
insert into public.user_plushie_unlocks (user_id, plushie_id, tokens_spent)
select distinct on (tl.user_id, tl.ref_id)
  tl.user_id,
  tl.ref_id,
  abs(tl.amount)::int
from public.token_ledger tl
inner join public.plushie_catalog pc on pc.id = tl.ref_id
where tl.reason = 'plushie_purchase'
  and tl.ref_id is not null
  and tl.amount < 0
  and (tl.ref_table is null or tl.ref_table = 'plushie_catalog')
order by tl.user_id, tl.ref_id, tl.created_at desc
on conflict (user_id, plushie_id) do nothing;

-- Idempotent per-user sync (SECURITY DEFINER); app may call on My Plushies load.
create or replace function public.game_sync_plushie_unlocks_from_ledger ()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  insert into public.user_plushie_unlocks (user_id, plushie_id, tokens_spent)
  select distinct on (tl.user_id, tl.ref_id)
    tl.user_id,
    tl.ref_id,
    abs(tl.amount)::int
  from public.token_ledger tl
  inner join public.plushie_catalog pc on pc.id = tl.ref_id
  where tl.user_id = uid
    and tl.reason = 'plushie_purchase'
    and tl.ref_id is not null
    and tl.amount < 0
    and (tl.ref_table is null or tl.ref_table = 'plushie_catalog')
  order by tl.user_id, tl.ref_id, tl.created_at desc
  on conflict (user_id, plushie_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.game_sync_plushie_unlocks_from_ledger () to authenticated;
