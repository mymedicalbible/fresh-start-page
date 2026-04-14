-- Optional scheduler wiring for push reminders.
-- This uses pg_cron + pg_net if available in your Supabase project.
-- Configure:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.push_cron_token = '<same as PUSH_REMINDER_CRON_TOKEN>';

create or replace function public.trigger_push_reminders_job()
returns void
language plpgsql
security definer
as $$
declare
  base_url text;
  cron_token text;
begin
  base_url := current_setting('app.settings.supabase_url', true);
  cron_token := current_setting('app.settings.push_cron_token', true);
  if coalesce(base_url, '') = '' or coalesce(cron_token, '') = '' then
    raise notice 'Skipping push reminder trigger: app.settings.supabase_url or app.settings.push_cron_token is not configured.';
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-token', cron_token
    ),
    body := '{"trigger":"pg_cron"}'::jsonb
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'schedule' and pg_function_is_visible(oid))
     and exists (select 1 from pg_proc where proname = 'http_post' and pg_function_is_visible(oid)) then
    if not exists (select 1 from cron.job where jobname = 'mb_push_reminders_every_5_min') then
      perform cron.schedule('mb_push_reminders_every_5_min', '*/5 * * * *', 'select public.trigger_push_reminders_job();');
    end if;
  else
    raise notice 'pg_cron/pg_net not available; schedule push-reminders using external cron + npm run push:run.';
  end if;
exception
  when undefined_table then
    raise notice 'cron.job table not present; schedule push-reminders externally.';
  when insufficient_privilege then
    raise notice 'No privilege to manage pg_cron; schedule push-reminders externally.';
end $$;

