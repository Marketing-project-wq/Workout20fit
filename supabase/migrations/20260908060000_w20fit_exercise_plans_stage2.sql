-- 20fit Workout — Exercise module, Stage 2: Menu Gerakan (plans)
-- A plan is a reusable ordered sequence of exercises a coach/doctor builds.
-- No patient column here — assignment is Stage 3 (one plan → many people).

-- staff = admin/coach/dokter (broader than exercise-edit, which is admin/coach)
create or replace function public.w20fit_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.w20fit_my_role() in ('admin','coach','dokter');
$$;
revoke all on function public.w20fit_is_staff() from public;
grant execute on function public.w20fit_is_staff() to authenticated;

create table if not exists public.w20fit_exercise_plans (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  deskripsi text,
  created_by uuid references auth.users(id),
  is_template boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists w20fit_plans_created_by_idx on public.w20fit_exercise_plans(created_by);

create table if not exists public.w20fit_exercise_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.w20fit_exercise_plans(id) on delete cascade,
  exercise_id uuid references public.w20fit_exercises(id),
  urutan int not null,
  sets int,
  reps int,
  durasi_detik int,
  istirahat_detik int default 30,
  catatan text
);
create index if not exists w20fit_plan_items_plan_idx on public.w20fit_exercise_plan_items(plan_id, urutan);

alter table public.w20fit_exercise_plans enable row level security;
alter table public.w20fit_exercise_plan_items enable row level security;

-- Plans: a staff member reads/manages the plans they created; admin sees all.
create policy w20fit_plans_select on public.w20fit_exercise_plans
  for select to authenticated
  using (created_by = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_plans_insert on public.w20fit_exercise_plans
  for insert to authenticated
  with check (public.w20fit_is_staff() and created_by = auth.uid());
create policy w20fit_plans_update on public.w20fit_exercise_plans
  for update to authenticated
  using (created_by = auth.uid() or public.w20fit_my_role() = 'admin')
  with check (created_by = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_plans_delete on public.w20fit_exercise_plans
  for delete to authenticated
  using (created_by = auth.uid() or public.w20fit_my_role() = 'admin');

-- Plan items inherit access from their parent plan.
create policy w20fit_plan_items_select on public.w20fit_exercise_plan_items
  for select to authenticated
  using (exists (select 1 from public.w20fit_exercise_plans p
                 where p.id = plan_id and (p.created_by = auth.uid() or public.w20fit_my_role() = 'admin')));
create policy w20fit_plan_items_write on public.w20fit_exercise_plan_items
  for all to authenticated
  using (exists (select 1 from public.w20fit_exercise_plans p
                 where p.id = plan_id and (p.created_by = auth.uid() or public.w20fit_my_role() = 'admin')))
  with check (exists (select 1 from public.w20fit_exercise_plans p
                 where p.id = plan_id and (p.created_by = auth.uid() or public.w20fit_my_role() = 'admin')));

drop trigger if exists w20fit_plans_touch on public.w20fit_exercise_plans;
create trigger w20fit_plans_touch before update on public.w20fit_exercise_plans
  for each row execute function public.w20fit_touch_updated_at();
