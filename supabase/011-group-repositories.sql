begin;
alter table public.groups add column github text check (github ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$');
grant insert (github), update (github) on public.groups to authenticated;
create policy group_owner_repository on public.groups for update to authenticated
using (owner = auth.uid()) with check (owner = auth.uid());
notify pgrst, 'reload schema';
commit;
