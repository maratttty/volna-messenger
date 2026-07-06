-- Fix: user search returns empty results for all authenticated users.
-- auth.role() = 'authenticated' is unreliable in newer Supabase versions
-- and can silently return no rows. auth.uid() IS NOT NULL is the correct
-- modern equivalent — any logged-in user gets a non-null uid.
drop policy if exists "profiles are readable by authenticated users" on profiles;
create policy "profiles are readable by authenticated users"
  on profiles for select using (auth.uid() is not null);
