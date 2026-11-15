begin;
create table public.member_details (
 owner uuid primary key references public.profiles on delete cascade,
 education text, school text, languages text, status text, interests text,
 linkedin text, github text, portfolio text,
 visible boolean not null default false
);
alter table public.member_details enable row level security;
grant select on public.member_details to anon, authenticated;
grant insert, update on public.member_details to authenticated;
create policy details_read on public.member_details for select using (visible or owner = auth.uid());
create policy details_write on public.member_details for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create table public.opportunities (
 id bigint generated always as identity primary key,
 author uuid not null references public.profiles on delete cascade,
 title text not null, kind text not null check (kind in ('Emploi','Stage','Freelance','Appel d’offres')),
 body text not null, created_at timestamptz not null default now()
);
alter table public.opportunities enable row level security;
grant select on public.opportunities to anon, authenticated;
grant insert (author,title,kind,body) on public.opportunities to authenticated;
create policy opportunities_read on public.opportunities for select using (true);
create policy opportunities_create on public.opportunities for insert to authenticated with check (author = auth.uid());

create table public.groups (
 id bigint generated always as identity primary key,
 owner uuid not null references public.profiles on delete cascade,
 title text not null, body text not null
);
create table public.group_members (
 group_id bigint references public.groups on delete cascade,
 member uuid references public.profiles on delete cascade,
 primary key (group_id, member)
);
create table public.group_posts (
 id bigint generated always as identity primary key,
 group_id bigint not null references public.groups on delete cascade,
 author uuid not null references public.profiles on delete cascade,
 body text not null
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
grant select on public.groups, public.group_posts to anon, authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant insert (owner,title,body) on public.groups to authenticated;
grant insert (group_id,author,body), delete on public.group_posts to authenticated;
create policy groups_read on public.groups for select using (true);
create policy groups_create on public.groups for insert to authenticated with check (owner = auth.uid());
create policy groups_members_read on public.group_members for select using (member = auth.uid());
create policy groups_join on public.group_members for insert with check (member = auth.uid());
create policy groups_leave on public.group_members for delete using (member = auth.uid());
create policy groups_posts_read on public.group_posts for select using (true);
create policy groups_posts_create on public.group_posts for insert with check (author = auth.uid() and (
 exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()) or
 exists(select 1 from public.group_members m where m.group_id = group_posts.group_id and m.member = auth.uid())
));
create policy groups_moderate on public.group_posts for delete using (author = auth.uid() or
 exists(select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()));

create table public.conversations (
 id bigint generated always as identity primary key,
 sender uuid not null references public.profiles on delete cascade,
 recipient uuid not null references public.profiles on delete cascade,
 state text not null default 'pending' check (state in ('pending','accepted','refused','blocked')),
 check (sender <> recipient)
);
create unique index unique_conversation on public.conversations (least(sender, recipient), greatest(sender, recipient));
create table public.private_messages (
 id bigint generated always as identity primary key,
 conversation bigint not null references public.conversations on delete cascade,
 author uuid not null references public.profiles on delete cascade,
 body text not null check (length(trim(body)) between 1 and 2000)
);
alter table public.conversations enable row level security;
alter table public.private_messages enable row level security;
grant select on public.conversations, public.private_messages to authenticated;
grant insert (sender, recipient), update (state) on public.conversations to authenticated;
grant insert (conversation,author,body) on public.private_messages to authenticated;
create policy conversation_read on public.conversations for select using (auth.uid() in (sender,recipient));
create policy conversation_create on public.conversations for insert with check (sender = auth.uid() and state = 'pending');
create policy conversation_decide on public.conversations for update
 using ((recipient = auth.uid() and state = 'pending') or (auth.uid() in (sender,recipient) and state = 'accepted'))
 with check ((recipient = auth.uid() and state in ('accepted','refused','blocked')) or (sender = auth.uid() and state = 'blocked'));
create policy message_read on public.private_messages for select using (
 exists(select 1 from public.conversations c where c.id = conversation and auth.uid() in (c.sender,c.recipient)));
create policy message_send on public.private_messages for insert with check (
 author = auth.uid() and exists(select 1 from public.conversations c where c.id = conversation and c.state = 'accepted' and auth.uid() in (c.sender,c.recipient)));

create table public.project_tasks (
 id bigint generated always as identity primary key,
 project bigint not null references public.projects on delete cascade,
 assignee uuid references public.profiles on delete set null,
 title text not null, done boolean not null default false
);
alter table public.project_tasks enable row level security;
grant select on public.project_tasks to anon, authenticated;
grant insert (project,assignee,title), update (done) on public.project_tasks to authenticated;
create policy tasks_read on public.project_tasks for select using (true);
create policy tasks_create on public.project_tasks for insert with check (
 exists(select 1 from public.projects p where p.id = project and p.author = auth.uid()) and
 (assignee is null or assignee = auth.uid() or exists(select 1 from public.applications a where a.project = project_tasks.project and a.author = assignee and a.accepted))
);
create policy tasks_update on public.project_tasks for update using (
 assignee = auth.uid() or exists(select 1 from public.projects p where p.id = project and p.author = auth.uid())
);
create view public.monthly_leaderboard with (security_invoker = true) as
select p.id, p.name, p.username, p.country, (count(s.question)*10)::integer as points
from public.profiles p left join public.answers a on a.author = p.id
left join public.solutions s on s.answer = a.id and s.accepted_at >= date_trunc('month', now(), 'UTC')
group by p.id;
grant select on public.monthly_leaderboard to anon, authenticated;
notify pgrst, 'reload schema';
commit;
