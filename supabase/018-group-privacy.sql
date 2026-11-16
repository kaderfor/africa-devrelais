begin;
alter policy profile_avatars_read on storage.objects using (
 bucket_id = 'profile-avatars' and (
   split_part(storage.objects.name, '/', 1) = auth.uid()::text or
   exists (select 1 from public.profiles p where p.avatar_path = storage.objects.name)
 )
);
alter table public.groups add column is_public boolean not null default false;
grant insert (is_public) on public.groups to authenticated;
create function public.can_see_group(target bigint)
returns boolean language sql stable security definer set search_path = '' as $see$
  select auth.uid() is not null and (
    public.can_access_group_versions(target) or
    exists (select 1 from public.groups g where g.id = target and g.is_public) or
    exists (select 1 from public.group_invitations i where i.group_id = target and i.recipient = auth.uid())
  );
$see$;
revoke execute on function public.can_see_group(bigint) from public, anon;
grant execute on function public.can_see_group(bigint) to authenticated;
alter policy groups_read on public.groups to authenticated using (public.can_see_group(id));
alter policy groups_join on public.group_members to authenticated with check (
 member = auth.uid() and exists (select 1 from public.groups g where g.id = group_id and g.is_public)
);
alter function public.accept_group_invitation(bigint) security definer;
revoke execute on function public.accept_group_invitation(bigint) from public, anon;

alter policy groups_posts_read on public.group_posts to authenticated using (public.can_access_group_versions(group_id));
alter table public.group_posts add column pdf_path text check (
 pdf_path is null or (split_part(pdf_path, '/', 1) = group_id::text and split_part(pdf_path, '/', 2) = author::text)
);
grant insert (pdf_path) on public.group_posts to authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('group-pdfs','group-pdfs',false,10485760,array['application/pdf']);
create policy group_pdfs_read on storage.objects for select to authenticated using (
 bucket_id = 'group-pdfs' and public.can_access_group_versions(
 case when split_part(name,'/',1) ~ '^[0-9]{1,18}$' then split_part(name,'/',1)::bigint end)
);
create policy group_pdfs_upload on storage.objects for insert to authenticated with check (
 bucket_id = 'group-pdfs' and split_part(name,'/',2) = auth.uid()::text and public.can_access_group_versions(
 case when split_part(name,'/',1) ~ '^[0-9]{1,18}$' then split_part(name,'/',1)::bigint end)
);
create policy group_pdfs_cleanup on storage.objects for delete to authenticated using (
 bucket_id = 'group-pdfs' and split_part(name,'/',2) = auth.uid()::text and not exists (
 select 1 from public.group_posts p where p.pdf_path = storage.objects.name)
);
notify pgrst, 'reload schema';
commit;
