begin;
alter table public.profiles add column username text;
update public.profiles set username = 'dev_' || replace(id::text, '-', '');
alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,40}$');
alter table public.profiles add constraint profiles_username_unique unique (username);

create or replace view public.leaderboard with (security_invoker = true) as
select p.id, p.name, p.country, (count(s.question) * 10)::integer as points, p.username
from public.profiles p
left join public.answers a on a.author = p.id
left join public.solutions s on s.answer = a.id
group by p.id;
notify pgrst, 'reload schema';
commit;
