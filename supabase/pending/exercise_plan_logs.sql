-- w20fit_exercise_plan_logs — per-set completion log for assigned exercises.
--
-- STATUS: ALREADY APPLIED to project cpvzwqptzcxnwzfzgrmt on 2026-10-13
-- (table + indexes + 2 RLS policies live; the updated_at trigger below was NOT
-- applied because function creates time out through the MCP bridge — the app
-- sends updated_at on every upsert instead, so the trigger is optional).
--
-- Patient (member app) writes their own rows with their JWT; the assigning
-- coach/doctor (w20fit_patient_programs.assigned_by) and admins read them.
-- Mirrors the access pattern already used by w20fit_exercise_plan_items.

create table if not exists public.w20fit_exercise_plan_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  program_id uuid not null references public.w20fit_patient_programs(id) on delete cascade,
  plan_id uuid references public.w20fit_exercise_plans(id) on delete cascade,
  plan_item_id uuid not null references public.w20fit_exercise_plan_items(id) on delete cascade,
  exercise_id uuid,
  sets_done integer not null default 0,
  sets_total integer,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, plan_item_id)
);

create index if not exists w20fit_eplogs_program_idx on public.w20fit_exercise_plan_logs(program_id);
create index if not exists w20fit_eplogs_user_idx on public.w20fit_exercise_plan_logs(user_id);

alter table public.w20fit_exercise_plan_logs enable row level security;

-- Patient: full control over their own rows, only for programs assigned to them
-- (matched by user_id, or by verified email for not-yet-linked assignments).
drop policy if exists w20fit_eplogs_patient_write on public.w20fit_exercise_plan_logs;
create policy w20fit_eplogs_patient_write on public.w20fit_exercise_plan_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.w20fit_patient_programs pp
      where pp.id = w20fit_exercise_plan_logs.program_id
        and ( pp.user_id = auth.uid()
              or lower(pp.target_email) = lower(coalesce(auth.jwt() ->> 'email','')) )
    )
  );

-- Coach / doctor (the assigner) and admin: read-only on logs for their programs.
drop policy if exists w20fit_eplogs_coach_select on public.w20fit_exercise_plan_logs;
create policy w20fit_eplogs_coach_select on public.w20fit_exercise_plan_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.w20fit_patient_programs pp
      where pp.id = w20fit_exercise_plan_logs.program_id
        and ( pp.assigned_by = auth.uid() or public.w20fit_my_role() = 'admin' )
    )
  );

-- OPTIONAL (not yet applied — MCB bridge times out on function create):
-- create or replace function public.w20fit_eplogs_touch() returns trigger
-- language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
-- drop trigger if exists w20fit_eplogs_touch_t on public.w20fit_exercise_plan_logs;
-- create trigger w20fit_eplogs_touch_t before update on public.w20fit_exercise_plan_logs
--   for each row execute function public.w20fit_eplogs_touch();
