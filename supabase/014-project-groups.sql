begin;
alter table public.projects add column group_id bigint references public.groups on delete set null;
create function public.open_project_group(target_project bigint, candidate uuid)
returns bigint language plpgsql security definer set search_path = '' as $project_group$
declare
  project_row public.projects%rowtype;
  target_group bigint;
begin
  select * into project_row from public.projects
    where id = target_project and author = auth.uid() for update;
  if not found or not exists (
    select 1 from public.applications where project = target_project and author = candidate and accepted
  ) then
    raise exception 'Seul le responsable peut inviter un candidat accepté.';
  end if;
  target_group := project_row.group_id;
  if target_group is null then
    insert into public.groups (owner, title, body, github)
    values (project_row.author, project_row.title, project_row.body, project_row.github)
    returning id into target_group;
    update public.projects set group_id = target_group where id = target_project;
  end if;
  if not exists (select 1 from public.groups where id = target_group and owner = auth.uid()) then
    raise exception 'Ce groupe ne dépend pas de ton projet.';
  end if;
  if not exists (select 1 from public.group_members where group_id = target_group and member = candidate) then
    insert into public.group_invitations (group_id, recipient)
    values (target_group, candidate) on conflict do nothing;
  end if;
  return target_group;
end;
$project_group$;
revoke execute on function public.open_project_group(bigint,uuid) from public, anon;
grant execute on function public.open_project_group(bigint,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
