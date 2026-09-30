-- 20fit Workout — Exercise module, Stage 5: per-exercise session logs.
-- One row per exercise the user works through in a guided session; records
-- how many sets they completed and whether they skipped. Used both for the
-- user's own progress bars (Stage 4) and the coach compliance view.
create table if not exists public.w20fit_exercise_session_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.w20fit_plan_assignments(id) on delete cascade,
  exercise_id uuid references public.w20fit_exercises(id),
  user_id uuid references auth.users(id),
  tanggal date default current_date,
  set_selesai int default 0,
  dilewati boolean default false,
  created_at timestamptz default now()
);
create index if not exists w20fit_logs_assignment_idx on public.w20fit_exercise_session_logs(assignment_id);
create index if not exists w20fit_logs_user_idx on public.w20fit_exercise_session_logs(user_id);

alter table public.w20fit_exercise_session_logs enable row level security;

-- The user reads & writes their own logs.
create policy w20fit_logs_select_own on public.w20fit_exercise_session_logs
  for select to authenticated using (user_id = auth.uid());
create policy w20fit_logs_insert_own on public.w20fit_exercise_session_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy w20fit_logs_update_own on public.w20fit_exercise_session_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- The coach/doctor who created the assignment can read its logs (compliance).
create policy w20fit_logs_select_staff on public.w20fit_exercise_session_logs
  for select to authenticated
  using (exists (select 1 from public.w20fit_plan_assignments a
                 where a.id = assignment_id
                   and (a.assigned_by = auth.uid() or public.w20fit_my_role() = 'admin')));
