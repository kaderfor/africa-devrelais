begin;
alter table public.opportunities drop constraint opportunities_kind_check;
alter table public.opportunities add constraint opportunities_kind_check
  check (kind in ('Emploi','Stage','Freelance','Appel d’offres','Communauté'));
alter table public.opportunities add column image_path text
  check (image_path is null or split_part(image_path, '/', 1) = author::text);
grant insert (image_path) on public.opportunities to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('opportunity-images', 'opportunity-images', false, 5242880, array['image/jpeg','image/png','image/webp']);
create policy opportunity_images_read on storage.objects for select to authenticated
using (bucket_id = 'opportunity-images' and (
  split_part(name, '/', 1) = (select auth.uid())::text
  or exists (select 1 from public.opportunities where image_path = name)
));
create policy opportunity_images_upload on storage.objects for insert to authenticated
with check (bucket_id = 'opportunity-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy opportunity_images_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'opportunity-images' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.opportunities where image_path = name));
notify pgrst, 'reload schema';
commit;
