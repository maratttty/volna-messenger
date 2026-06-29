-- A "public" bucket only controls whether reads via the public URL skip auth —
-- it does NOT grant upload rights. storage.objects has its own RLS, separate
-- from our app tables, and needs explicit policies.

create policy "authenticated users can upload to attachments (own folder)"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anyone can read attachments"
  on storage.objects for select
  using (bucket_id = 'attachments');

create policy "users can update their own attachments"
  on storage.objects for update
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete their own attachments"
  on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated users can upload to avatars (own folder)"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anyone can read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users can update their own avatars"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete their own avatars"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
