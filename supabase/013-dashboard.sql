begin;
create table public.notification_reads (
 owner uuid references public.profiles on delete cascade,
 event_key text,
 primary key(owner,event_key)
);
alter table public.notification_reads enable row level security;
grant select, insert on public.notification_reads to authenticated;
create policy own_notification_reads on public.notification_reads to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
commit;
