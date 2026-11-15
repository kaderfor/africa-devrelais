begin;
revoke select on public.profiles, public.questions, public.answers, public.solutions, public.leaderboard,
  public.guides, public.projects, public.posts, public.member_details, public.opportunities,
  public.groups, public.group_posts, public.project_tasks, public.monthly_leaderboard from anon;
notify pgrst, 'reload schema';
commit;
