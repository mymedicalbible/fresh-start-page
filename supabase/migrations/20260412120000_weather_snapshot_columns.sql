-- Optional JSON weather context on quick logs (Open-Meteo + air quality snapshot)
alter table public.pain_entries
  add column if not exists weather_snapshot jsonb;

alter table public.symptom_logs
  add column if not exists weather_snapshot jsonb;
