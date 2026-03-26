-- Storage bucket + RLS for doctor visit documents uploads

-- 1) Create bucket (private)
insert into storage.buckets (id, name, public)
values ('visit-docs', 'visit-docs', false)
on conflict (id) do nothing;

-- 2) RLS for storage objects: objects live under:
--    <user_id>/<doctor_visit_id>/<filename>
--    So we can lock access to the folder for the logged-in user.
alter table storage.objects enable row level security;

drop policy if exists "visit_docs_select_own" on storage.objects;
drop policy if exists "visit_docs_insert_own" on storage.objects;
drop policy if exists "visit_docs_delete_own" on storage.objects;

create policy "visit_docs_select_own"
on storage.objects
for select
using (
  bucket_id = 'visit-docs'
  and split_part(name, '/', 1)::uuid = auth.uid()
);

create policy "visit_docs_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'visit-docs'
  and split_part(name, '/', 1)::uuid = auth.uid()
);

create policy "visit_docs_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'visit-docs'
  and split_part(name, '/', 1)::uuid = auth.uid()
);

