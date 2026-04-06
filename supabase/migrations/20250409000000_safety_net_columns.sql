-- Safety-net migration: idempotent additions for every column/table that
-- may be missing depending on which previous migrations were applied.
-- Safe to re-run — all statements use IF NOT EXISTS / IF EXISTS guards.

-- doctor_visits.status  (pending / complete workflow)
ALTER TABLE public.doctor_visits
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'complete';

ALTER TABLE public.doctor_visits
  ADD COLUMN IF NOT EXISTS is_finalized boolean DEFAULT true;

-- doctor_questions.doctor_specialty
ALTER TABLE public.doctor_questions
  ADD COLUMN IF NOT EXISTS doctor_specialty text;

-- mcas_episodes.activity  (what were you doing in the 4 hours before)
ALTER TABLE public.mcas_episodes
  ADD COLUMN IF NOT EXISTS activity text;

-- current_medications.frequency  (schedule / how often)
ALTER TABLE public.current_medications
  ADD COLUMN IF NOT EXISTS frequency text;

-- Ensure doctors table exists
CREATE TABLE IF NOT EXISTS public.doctors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  specialty  text,
  phone      text,
  address    text,
  notes      text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctors_user ON public.doctors (user_id);
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doctors_own" ON public.doctors;
CREATE POLICY "doctors_own" ON public.doctors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ensure tests_ordered table exists
CREATE TABLE IF NOT EXISTS public.tests_ordered (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  test_date  date NOT NULL,
  doctor     text,
  test_name  text NOT NULL,
  reason     text,
  status     text DEFAULT 'Pending',
  results    text,
  notes      text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tests_user_date ON public.tests_ordered (user_id, test_date DESC);
ALTER TABLE public.tests_ordered ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tests_own" ON public.tests_ordered;
CREATE POLICY "tests_own" ON public.tests_ordered
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ensure appointments table exists
CREATE TABLE IF NOT EXISTS public.appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  doctor            text,
  specialty         text,
  appointment_date  date NOT NULL,
  appointment_time  text,
  visit_logged      boolean DEFAULT false,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON public.appointments (user_id, appointment_date);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_own" ON public.appointments;
CREATE POLICY "appointments_own" ON public.appointments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- diagnoses_directory table (if not present from a prior migration)
CREATE TABLE IF NOT EXISTS public.diagnoses_directory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  diagnosis      text NOT NULL,
  status         text DEFAULT 'Suspected',
  doctor         text,
  date_diagnosed date,
  notes          text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnoses_user ON public.diagnoses_directory (user_id);
ALTER TABLE public.diagnoses_directory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diagnoses_own" ON public.diagnoses_directory;
CREATE POLICY "diagnoses_own" ON public.diagnoses_directory
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
