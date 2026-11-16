begin;
create table public.post_likes (
  post bigint references public.posts on delete cascade,
  author uuid references public.profiles on delete cascade,
  primary key (post, author)
);
create table public.post_comments (
  id bigint generated always as identity primary key,
  post bigint not null references public.posts on delete cascade,
  author uuid not null references public.profiles on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000)
);
create index post_comments_by_post on public.post_comments(post,id);
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
revoke all on public.post_likes, public.post_comments from anon, authenticated;
grant select, insert on public.post_likes, public.post_comments to authenticated;
grant delete on public.post_likes to authenticated;
create policy post_likes_read on public.post_likes for select to authenticated using (true);
create policy post_likes_insert on public.post_likes for insert to authenticated with check (author = auth.uid());
create policy post_likes_delete on public.post_likes for delete to authenticated using (author = auth.uid());
create policy post_comments_read on public.post_comments for select to authenticated using (true);
create policy post_comments_insert on public.post_comments for insert to authenticated with check (author = auth.uid());
notify pgrst, 'reload schema';
commit;
