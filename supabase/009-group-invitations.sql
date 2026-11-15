begin;
create table public.group_invitations (
  group_id bigint references public.groups on delete cascade,
  recipient uuid references public.profiles on delete cascade,
  primary key (group_id, recipient)
);
alter table public.group_invitations enable row level security;
grant select, insert, delete on public.group_invitations to authenticated;
create policy group_invitation_read on public.group_invitations for select to authenticated using (
  recipient = auth.uid() or exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid())
);
create policy group_invitation_send on public.group_invitations for insert to authenticated with check (
  recipient <> auth.uid() and exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid())
  and not exists(select 1 from public.group_members m where m.group_id = group_invitations.group_id and m.member = recipient)
);
create policy group_invitation_delete on public.group_invitations for delete to authenticated using (
  recipient = auth.uid() or exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid())
);
create policy group_owner_members_read on public.group_members for select to authenticated using (
  exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid())
);
create policy group_owner_remove_member on public.group_members for delete to authenticated using (
  exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid())
);
create function public.accept_group_invitation(target_group bigint)
returns void language plpgsql security invoker set search_path = '' as $invitation$
begin
  delete from public.group_invitations where group_id = target_group and recipient = auth.uid();
  if not found then raise exception 'Cette invitation n’est plus disponible.'; end if;
  insert into public.group_members (group_id, member) values (target_group, auth.uid()) on conflict do nothing;
end;
$invitation$;
revoke execute on function public.accept_group_invitation(bigint) from public;
grant execute on function public.accept_group_invitation(bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
