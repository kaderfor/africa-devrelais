begin;
alter table public.posts add column image_path text
  check (image_path is null or split_part(image_path, '/', 1) = author::text);
grant insert (image_path) on public.posts to authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy post_images_read on storage.objects for select to authenticated
using (bucket_id = 'post-images' and exists (select 1 from public.posts where image_path = name));
create policy post_images_read_pending on storage.objects for select to authenticated
using (bucket_id = 'post-images' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy post_images_upload on storage.objects for insert to authenticated
with check (bucket_id = 'post-images' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy post_images_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'post-images' and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (select 1 from public.posts where image_path = name));
notify pgrst, 'reload schema';
commit;
