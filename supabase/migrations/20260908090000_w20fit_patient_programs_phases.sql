-- 20fit Workout — Exercise module: patient-centric programs.
-- A "program" (e.g. "Pemulihan Lutut") is assigned to one patient (by email).
-- Each program contains ordered "fase" (phases); a fase is one row in
-- w20fit_exercise_plans (reused) tagged with program_id + urutan + fase_nama,
-- and a fase's "menu gerakan" is its w20fit_exercise_plan_items.
--
-- This replaces the earlier standalone "Menu Gerakan → assign plan by email"
-- flow with a single patient-centric Peserta hub in the CMS:
--   Peserta → pilih pasien → Program → Fase → menu gerakan.
-- The old w20fit_plan_assignments table stays in place but is no longer used
-- by the new hub.
create table if not exists public.w20fit_patient_programs (
  id uuid primary key default gen_random_uuid(),
  target_email text not null,
  user_id uuid references auth.users(id),
  assigned_by uuid references auth.users(id),
  nama text not null,
  deskripsi text default '',
  catatan text default '',
  status text default 'pending',
  created_at timestamptz default now()
);
create index if not exists w20fit_pp_assignedby_idx on public.w20fit_patient_programs(assigned_by);
create index if not exists w20fit_pp_user_idx on public.w20fit_patient_programs(user_id);
create index if not exists w20fit_pp_email_idx on public.w20fit_patient_programs(lower(target_email));

-- Reuse exercise_plans as a phase inside a program.
alter table public.w20fit_exercise_plans add column if not exists program_id uuid references public.w20fit_patient_programs(id) on delete cascade;
alter table public.w20fit_exercise_plans add column if not exists urutan int default 1;
alter table public.w20fit_exercise_plans add column if not exists fase_nama text default '';
create index if not exists w20fit_plans_program_idx on public.w20fit_exercise_plans(program_id);

-- RLS on the program table: each coach/doctor only sees the patients &
-- programs they assigned; the patient sees their own; admin sees all.
alter table public.w20fit_patient_programs enable row level security;
drop policy if exists w20fit_pp_select on public.w20fit_patient_programs;
create policy w20fit_pp_select on public.w20fit_patient_programs
  for select to authenticated
  using (user_id = auth.uid() or assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');
drop policy if exists w20fit_pp_insert on public.w20fit_patient_programs;
create policy w20fit_pp_insert on public.w20fit_patient_programs
  for insert to authenticated
  with check (assigned_by = auth.uid() and public.w20fit_is_staff());
drop policy if exists w20fit_pp_update on public.w20fit_patient_programs;
create policy w20fit_pp_update on public.w20fit_patient_programs
  for update to authenticated
  using (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin')
  with check (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');
drop policy if exists w20fit_pp_delete on public.w20fit_patient_programs;
create policy w20fit_pp_delete on public.w20fit_patient_programs
  for delete to authenticated
  using (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');

-- Patient (and the assigning staff/admin) can read the phases & items of a
-- program. Additive to the existing created_by-based staff policies on plans.
drop policy if exists w20fit_plans_select_program on public.w20fit_exercise_plans;
create policy w20fit_plans_select_program on public.w20fit_exercise_plans
  for select to authenticated
  using (program_id is not null and exists (
    select 1 from public.w20fit_patient_programs pp
     where pp.id = w20fit_exercise_plans.program_id
       and (pp.user_id = auth.uid() or pp.assigned_by = auth.uid() or public.w20fit_my_role() = 'admin')));
drop policy if exists w20fit_plan_items_select_program on public.w20fit_exercise_plan_items;
create policy w20fit_plan_items_select_program on public.w20fit_exercise_plan_items
  for select to authenticated
  using (exists (
    select 1 from public.w20fit_exercise_plans p
       join public.w20fit_patient_programs pp on pp.id = p.program_id
     where p.id = w20fit_exercise_plan_items.plan_id
       and (pp.user_id = auth.uid() or pp.assigned_by = auth.uid() or public.w20fit_my_role() = 'admin')));

-- RPC: create a program for a patient email, resolving the email to a user id
-- (the client cannot read auth.users). Status is 'aktif' if the email already
-- has an account, else 'pending' until they sign up.
create or replace function public.w20fit_assign_program(p_email text, p_nama text, p_deskripsi text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare uid uuid; pid uuid; em text; nm text;
begin
  em := lower(trim(p_email));
  nm := trim(coalesce(p_nama,''));
  if em is null or em = '' or position('@' in em) = 0 then raise exception 'invalid_email'; end if;
  if nm = '' then raise exception 'invalid_nama'; end if;
  if not public.w20fit_is_staff() then raise exception 'not_staff'; end if;
  select id into uid from auth.users where lower(email) = em limit 1;
  insert into public.w20fit_patient_programs(target_email, user_id, assigned_by, nama, deskripsi, status)
  values (em, uid, auth.uid(), nm, nullif(trim(coalesce(p_deskripsi,'')),''),
          case when uid is not null then 'aktif' else 'pending' end)
  returning id into pid;
  return jsonb_build_object('id', pid, 'existing', uid is not null);
end; $function$;
grant execute on function public.w20fit_assign_program(text,text,text) to authenticated;

-- Extend claim-on-login to also attach pending programs to the new account.
create or replace function public.w20fit_claim_assignments()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare em text; cnt int; cnt2 int;
begin
  select email into em from auth.users where id = auth.uid();
  if em is null then return 0; end if;
  insert into public.w20fit_profiles(id, email) values (auth.uid(), em)
    on conflict (id) do update set email = excluded.email;
  update public.w20fit_plan_assignments
     set assigned_to = auth.uid(), status = 'aktif'
   where assigned_to is null and status = 'pending'
     and lower(assigned_to_email) = lower(em);
  get diagnostics cnt = row_count;
  update public.w20fit_patient_programs
     set user_id = auth.uid(), status = 'aktif'
   where user_id is null and lower(target_email) = lower(em);
  get diagnostics cnt2 = row_count;
  return cnt + cnt2;
end; $function$;
