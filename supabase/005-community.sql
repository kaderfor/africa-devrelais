begin;
alter table public.profiles add column bio text check (length(bio) <= 600);
alter table public.profiles add column skills text check (length(skills) <= 250);
create function public.edit_profile_details(new_bio text, new_skills text)
returns void language sql security definer set search_path = '' as $profile$
 update public.profiles set bio = new_bio, skills = new_skills where id = auth.uid();
$profile$;
revoke execute on function public.edit_profile_details(text,text) from public;
grant execute on function public.edit_profile_details(text,text) to authenticated;
create table public.follows (
 follower uuid references public.profiles on delete cascade,
 followed uuid references public.profiles on delete cascade,
 primary key (follower, followed),
 check (follower <> followed)
);
create table public.posts (
 id bigint generated always as identity primary key,
 author uuid not null references public.profiles on delete cascade,
 body text not null check (length(trim(body)) between 3 and 2000),
 created_at timestamptz not null default now()
);
alter table public.follows enable row level security;
alter table public.posts enable row level security;
grant select, insert, delete on public.follows to authenticated;
grant select on public.posts to anon, authenticated;
grant insert (author, body) on public.posts to authenticated;
create policy follows_read on public.follows for select to authenticated using (follower = auth.uid());
create policy follows_add on public.follows for insert to authenticated with check (follower = auth.uid());
create policy follows_remove on public.follows for delete to authenticated using (follower = auth.uid());
create policy posts_read on public.posts for select using (true);
create policy posts_add on public.posts for insert to authenticated with check (author = auth.uid());
notify pgrst, 'reload schema';
commit;

