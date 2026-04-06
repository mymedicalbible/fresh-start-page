-- PostgREST schema-cache fix: create an RPC function the client can call
-- to fetch medication_change_events even if the table hasn't been picked up
-- by PostgREST's REST endpoint cache yet.
--
-- Also fires a schema reload notification so direct table queries work too.

-- 1) Force PostgREST to reload and discover the table
SELECT pg_notify('pgrst', 'reload schema');

-- 2) RPC function as a reliable query path
CREATE OR REPLACE FUNCTION public.get_medication_change_events(
  p_since date DEFAULT (now() - interval '120 days')::date,
  p_limit int  DEFAULT 50
)
RETURNS TABLE (
  event_date    date,
  medication    text,
  event_type    text,
  dose_previous text,
  dose_new      text,
  frequency_previous text,
  frequency_new text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.event_date, m.medication, m.event_type,
         m.dose_previous, m.dose_new,
         m.frequency_previous, m.frequency_new
  FROM   medication_change_events m
  WHERE  m.user_id = auth.uid()
    AND  m.event_date >= p_since
  ORDER BY m.event_date DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.get_medication_change_events IS
  'Fetch medication change history for the current user. Works even when PostgREST table cache is stale.';

-- 3) RPC insert so the Medications page can log changes even with a stale cache
CREATE OR REPLACE FUNCTION public.insert_medication_change_event(
  p_event_date    date,
  p_medication    text,
  p_event_type    text,
  p_dose_previous text DEFAULT NULL,
  p_dose_new      text DEFAULT NULL,
  p_frequency_previous text DEFAULT NULL,
  p_frequency_new text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO medication_change_events
    (user_id, event_date, medication, event_type,
     dose_previous, dose_new, frequency_previous, frequency_new)
  VALUES
    (auth.uid(), p_event_date, p_medication, p_event_type,
     p_dose_previous, p_dose_new, p_frequency_previous, p_frequency_new);
$$;

COMMENT ON FUNCTION public.insert_medication_change_event IS
  'Insert a medication change event for the current user. Bypasses PostgREST table cache.';
