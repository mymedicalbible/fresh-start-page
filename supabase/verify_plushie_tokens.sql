-- Run in Supabase SQL Editor after applying 20260411120000_game_tokens_trial.sql.
-- Expect: 5 public functions named game_* (insert helper + 4 RPCs), 4 tables, RLS on ledger/unlocks/catalog/config.

select routine_name as function_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name like 'game_%'
order by routine_name;

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('token_ledger', 'plushie_catalog', 'user_plushie_unlocks', 'game_config')
order by tablename;

select relname, relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('token_ledger', 'plushie_catalog', 'user_plushie_unlocks', 'game_config');
