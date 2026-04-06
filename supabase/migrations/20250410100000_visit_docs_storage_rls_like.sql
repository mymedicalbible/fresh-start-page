-- Reliable RLS for visit-docs: objects under <your-user-uuid>/...
-- Safe to run from Supabase SQL Editor (does NOT ALTER storage.objects — that causes
-- ERROR 42501 "must be owner of table objects" for many project roles).
--
-- 1) Create bucket first if needed: Dashboard → Storage → New bucket → ID visit-docs → Private.
-- 2) Then run this entire script.

INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-docs', 'visit-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Do NOT run: ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- RLS is already on; altering the table requires table owner (often fails in SQL Editor).

DROP POLICY IF EXISTS "visit_docs_select_own" ON storage.objects;
DROP POLICY IF EXISTS "visit_docs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "visit_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "visit_docs_delete_own" ON storage.objects;

CREATE POLICY "visit_docs_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'visit-docs'
  AND name LIKE (auth.uid()::text || '/%')
);

CREATE POLICY "visit_docs_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'visit-docs'
  AND name LIKE (auth.uid()::text || '/%')
);

CREATE POLICY "visit_docs_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'visit-docs'
  AND name LIKE (auth.uid()::text || '/%')
)
WITH CHECK (
  bucket_id = 'visit-docs'
  AND name LIKE (auth.uid()::text || '/%')
);

CREATE POLICY "visit_docs_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'visit-docs'
  AND name LIKE (auth.uid()::text || '/%')
);
