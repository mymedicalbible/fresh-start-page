-- Allow authenticated users to update (overwrite) their own objects in visit-docs
-- Some clients use storage upsert or replace; INSERT-only policies can block follow-up uploads.

drop policy if exists "visit_docs_update_own" on storage.objects;

create policy "visit_docs_update_own"
on storage.objects
for update
using (
  bucket_id = 'visit-docs'
  and split_part(name, '/', 1)::uuid = auth.uid()
)
with check (
  bucket_id = 'visit-docs'
  and split_part(name, '/', 1)::uuid = auth.uid()
);
