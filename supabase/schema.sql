create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  country text not null check (country in ('DZ','AO','BJ','BW','BF','BI','CM','CV','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW'))
);
create table public.questions (
  id bigint generated always as identity primary key,
  author uuid not null references public.profiles on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 150),
  body text not null check (char_length(trim(body)) between 10 and 5000),
  created_at timestamptz not null default now()
);
create table public.answers (
  id bigint generated always as identity primary key,
  question bigint not null references public.questions on delete cascade,
  author uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(trim(body)) between 5 and 5000)
);
create table public.solutions (
  question bigint primary key references public.questions on delete cascade,
  answer bigint not null references public.answers on delete cascade,
  accepted_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.solutions enable row level security;

create policy profiles_read on public.profiles for select using (true);
create policy questions_read on public.questions for select using (true);
create policy answers_read on public.answers for select using (true);
create policy solutions_read on public.solutions for select using (true);
create policy own_profile on public.profiles for insert to authenticated with check (id = auth.uid());
create policy own_question on public.questions for insert to authenticated with check (author = auth.uid());
create policy own_answer on public.answers for insert to authenticated with check (author = auth.uid());

create function public.accept_solution(problem_id bigint, response_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.questions q join public.answers a on a.question = q.id
    where q.id = problem_id and a.id = response_id
      and q.author = auth.uid() and a.author <> auth.uid()
  ) then
    raise exception 'Cette réponse ne peut pas être acceptée.';
  end if;
  insert into public.solutions (question, answer) values (problem_id, response_id)
  on conflict (question) do update set answer = excluded.answer, accepted_at = now()
  where solutions.answer <> excluded.answer;
end;
$$;
revoke execute on function public.accept_solution(bigint,bigint) from public;
grant execute on function public.accept_solution(bigint,bigint) to authenticated;

create view public.leaderboard with (security_invoker = true) as
select p.id, p.name, p.country, (count(s.question) * 10)::integer as points
from public.profiles p
left join public.answers a on a.author = p.id
left join public.solutions s on s.answer = a.id
group by p.id;
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.questions, public.answers, public.solutions, public.leaderboard to anon, authenticated;
grant insert on public.profiles, public.questions, public.answers to authenticated;
