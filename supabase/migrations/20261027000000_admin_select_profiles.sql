-- profiles only had a "view your own row" policy — admins had no way to
-- read the full signups list (RLS blocked it even for is_admin() users).
-- Needed for the admin dashboard's "new signups" stats/feed.
create policy "Admins can view all profiles" on public.profiles
  for select
  using (is_admin());
