begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('question-images', 'question-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
 ('guide-pdfs', 'guide-pdfs', true, 10485760, array['application/pdf']);

alter table public.questions add column image_path text
 check (image_path is null or split_part(image_path, '/', 1) = author::text);
alter table public.guides add column pdf_path text
 check (pdf_path is null or split_part(pdf_path, '/', 1) = author::text);

create policy attachments_insert on storage.objects for insert to authenticated
 with check (bucket_id in ('question-images', 'guide-pdfs') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_select_own on storage.objects for select to authenticated
 using (bucket_id in ('question-images', 'guide-pdfs') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_cleanup on storage.objects for delete to authenticated
 using (
   (storage.foldername(name))[1] = (select auth.uid())::text
   and (
     (bucket_id = 'question-images' and not exists (select 1 from public.questions where image_path = name))
     or (bucket_id = 'guide-pdfs' and not exists (select 1 from public.guides where pdf_path = name))
   )
 );
notify pgrst, 'reload schema';
commit;
