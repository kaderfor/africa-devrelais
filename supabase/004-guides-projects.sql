begin;
create table public.guides (
 id bigint generated always as identity primary key,
 author uuid not null references public.profiles on delete cascade,
 title text not null check (length(trim(title)) between 3 and 150),
 body text not null check (length(trim(body)) between 5 and 10000),
 source_question bigint references public.questions on delete set null,
 credited_author uuid references public.profiles on delete set null
);
create table public.projects (
 id bigint generated always as identity primary key,
 author uuid not null references public.profiles on delete cascade,
 title text not null check (length(trim(title)) between 3 and 150),
 body text not null check (length(trim(body)) between 5 and 10000),
 github text check (github ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$'),
 paid boolean not null default false
);
create table public.applications (
 project bigint references public.projects on delete cascade,
 author uuid references public.profiles on delete cascade,
 body text not null check (length(trim(body)) between 5 and 2000),
 accepted boolean not null default false,
 primary key (project, author)
);
alter table public.guides enable row level security;
alter table public.projects enable row level security;
alter table public.applications enable row level security;
grant select on public.guides, public.projects to anon, authenticated;
grant insert on public.guides, public.projects to authenticated;
grant select on public.applications to authenticated;
grant insert (project, author, body), update (accepted) on public.applications to authenticated;
create policy guides_read on public.guides for select using (true);
create policy projects_read on public.projects for select using (true);
create policy guides_write on public.guides for insert to authenticated with check (
 author = auth.uid() and ((source_question is null and credited_author is null) or exists (
   select 1 from public.solutions s join public.answers a on a.id = s.answer
   where s.question = source_question and a.author = credited_author
 ))
);
create policy projects_write on public.projects for insert to authenticated with check (author = auth.uid());
create policy applications_read on public.applications for select to authenticated using (
 author = auth.uid() or exists (select 1 from public.projects p where p.id = project and p.author = auth.uid())
);
create policy applications_write on public.applications for insert to authenticated with check (
 author = auth.uid() and exists (select 1 from public.projects p where p.id = project and p.author <> auth.uid())
);
create policy applications_accept on public.applications for update to authenticated using (
 exists (select 1 from public.projects p where p.id = project and p.author = auth.uid())
);
notify pgrst, 'reload schema';
commit;
