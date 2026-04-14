-- Profile avatar uploads: profile field + private storage bucket + per-user object RLS.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public)
values ('profile-icons', 'profile-icons', false)
on conflict (id) do nothing;

drop policy if exists "profile_icons_select_own" on storage.objects;
drop policy if exists "profile_icons_insert_own" on storage.objects;
drop policy if exists "profile_icons_update_own" on storage.objects;
drop policy if exists "profile_icons_delete_own" on storage.objects;

create policy "profile_icons_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-icons'
  and name like (auth.uid()::text || '/%')
);

create policy "profile_icons_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-icons'
  and name like (auth.uid()::text || '/%')
);

create policy "profile_icons_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-icons'
  and name like (auth.uid()::text || '/%')
)
with check (
  bucket_id = 'profile-icons'
  and name like (auth.uid()::text || '/%')
);

create policy "profile_icons_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-icons'
  and name like (auth.uid()::text || '/%')
);
