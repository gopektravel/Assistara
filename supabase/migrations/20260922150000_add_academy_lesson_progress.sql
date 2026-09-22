create table if not exists public.academy_lesson_progress (
  user_id uuid references auth.users(id) on delete cascade,
  lesson_key text not null,
  action_submitted boolean not null default false,
  quiz_score integer,
  quiz_passed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_key),
  constraint academy_lesson_progress_quiz_score_check
    check (quiz_score is null or quiz_score between 0 and 100)
);

alter table public.academy_lesson_progress enable row level security;
grant select, insert, update on public.academy_lesson_progress to authenticated;

create policy "Users can read their own Academy lesson progress"
  on public.academy_lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own Academy lesson progress"
  on public.academy_lesson_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own Academy lesson progress"
  on public.academy_lesson_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
