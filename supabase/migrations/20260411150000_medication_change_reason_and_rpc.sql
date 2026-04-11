-- Optional free-text reason for dose/start/stop logs; expose id + created_at in RPC for timelines.

ALTER TABLE public.medication_change_events
  ADD COLUMN IF NOT EXISTS change_reason text;

SELECT pg_notify('pgrst', 'reload schema');

DROP FUNCTION IF EXISTS public.get_medication_change_events(date, int);

CREATE OR REPLACE FUNCTION public.get_medication_change_events(
  p_since date DEFAULT (now() - interval '120 days')::date,
  p_limit int  DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  event_date    date,
  medication    text,
  event_type    text,
  dose_previous text,
  dose_new      text,
  frequency_previous text,
  frequency_new text,
  created_at timestamptz,
  change_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.event_date, m.medication, m.event_type,
         m.dose_previous, m.dose_new,
         m.frequency_previous, m.frequency_new,
         m.created_at, m.change_reason
  FROM   medication_change_events m
  WHERE  m.user_id = auth.uid()
    AND  m.event_date >= p_since
  ORDER BY m.event_date DESC, m.created_at DESC NULLS LAST
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.get_medication_change_events IS
  'Fetch medication change history for the current user. Works even when PostgREST table cache is stale.';

DROP FUNCTION IF EXISTS public.insert_medication_change_event(date, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.insert_medication_change_event(
  p_event_date    date,
  p_medication    text,
  p_event_type    text,
  p_dose_previous text DEFAULT NULL,
  p_dose_new      text DEFAULT NULL,
  p_frequency_previous text DEFAULT NULL,
  p_frequency_new text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO medication_change_events
    (user_id, event_date, medication, event_type,
     dose_previous, dose_new, frequency_previous, frequency_new, change_reason)
  VALUES
    (auth.uid(), p_event_date, p_medication, p_event_type,
     p_dose_previous, p_dose_new, p_frequency_previous, p_frequency_new, p_change_reason);
$$;

COMMENT ON FUNCTION public.insert_medication_change_event IS
  'Insert a medication change event for the current user. Bypasses PostgREST table cache.';
