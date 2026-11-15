begin;
alter table public.profiles add column avatar_path text
  check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy profile_avatars_read on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and (split_part(name, '/', 1) = (select auth.uid())::text
  or exists (select 1 from public.profiles where avatar_path = name)));
create policy profile_avatars_upload on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy profile_avatars_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (select 1 from public.profiles where avatar_path = name));
create function public.save_member_avatar(path text)
returns void language plpgsql security definer set search_path = '' as $avatar$
begin
  if auth.uid() is null or (path is not null and (
    split_part(path, '/', 1) <> auth.uid()::text or not exists (
      select 1 from storage.objects where bucket_id = 'profile-avatars' and name = path
    )
  )) then raise exception 'Photo de profil non autorisée.'; end if;
  update public.profiles set avatar_path = path where id = auth.uid();
  if not found then raise exception 'Profil introuvable.'; end if;
end;
$avatar$;
revoke execute on function public.save_member_avatar(text) from public, anon;
grant execute on function public.save_member_avatar(text) to authenticated;
notify pgrst, 'reload schema';
commit;
