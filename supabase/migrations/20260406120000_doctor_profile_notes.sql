-- Timestamped notes per doctor (journal), separate from doctors.notes profile field
CREATE TABLE IF NOT EXISTS public.doctor_profile_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_profile_notes_user_created
  ON public.doctor_profile_notes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doctor_profile_notes_doctor
  ON public.doctor_profile_notes (doctor_id, created_at DESC);

ALTER TABLE public.doctor_profile_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctor_profile_notes_own" ON public.doctor_profile_notes;
CREATE POLICY "doctor_profile_notes_own" ON public.doctor_profile_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
