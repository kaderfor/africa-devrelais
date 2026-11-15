begin;
grant update (username) on public.profiles to authenticated;
create policy choose_legacy_username on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and username = 'dev_' || replace(id::text, '-', ''))
  with check (id = (select auth.uid()) and username !~ '^dev_[0-9a-f]{32}$');
alter table public.profiles add constraint profiles_username_reserved
  check (username !~ '^dev_[0-9a-f]{32}$' or username = 'dev_' || replace(id::text, '-', ''));
commit;
