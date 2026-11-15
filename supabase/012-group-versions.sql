begin;
create function public.can_access_group_versions(target bigint)
returns boolean language sql stable security definer set search_path = '' as $access$
  select auth.uid() is not null and exists (
    select 1 from public.groups g where g.id = target and (
      g.owner = auth.uid() or exists (
        select 1 from public.group_members m where m.group_id = g.id and m.member = auth.uid()
      )
    )
  );
$access$;
revoke execute on function public.can_access_group_versions(bigint) from public;
grant execute on function public.can_access_group_versions(bigint) to authenticated;

create table public.group_versions (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups on delete cascade,
  author uuid not null references public.profiles,
  archive text not null unique,
  note text not null check (length(trim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  check (archive ~ ('^' || group_id || '/' || author || '/[0-9a-f-]{36}[.]zip$'))
);
create index group_versions_history on public.group_versions (group_id, id desc);
alter table public.group_versions enable row level security;
grant select on public.group_versions to authenticated;
grant insert (group_id, author, archive, note) on public.group_versions to authenticated;
create policy group_versions_read on public.group_versions for select to authenticated
using (public.can_access_group_versions(group_id));
create policy group_versions_publish on public.group_versions for insert to authenticated
with check (author = auth.uid() and public.can_access_group_versions(group_id) and exists (
  select 1 from storage.objects o where o.bucket_id = 'group-archives' and o.name = archive
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-archives', 'group-archives', false, 20971520, array['application/zip']);
create policy group_archives_read on storage.objects for select to authenticated using (
  bucket_id = 'group-archives' and public.can_access_group_versions(
    case when split_part(name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(name, '/', 1)::bigint end)
);
create policy group_archives_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'group-archives' and split_part(name, '/', 2) = auth.uid()::text
  and name ~ '^[0-9]+/[0-9a-f-]{36}/[0-9a-f-]{36}[.]zip$'
  and public.can_access_group_versions(
    case when split_part(name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(name, '/', 1)::bigint end)
);
create policy group_archives_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'group-archives' and split_part(name, '/', 2) = auth.uid()::text
  and not exists (select 1 from public.group_versions v where v.archive = name)
  and public.can_access_group_versions(
    case when split_part(name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(name, '/', 1)::bigint end)
);
notify pgrst, 'reload schema';
commit;
