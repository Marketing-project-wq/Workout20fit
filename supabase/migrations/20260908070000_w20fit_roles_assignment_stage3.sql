-- 20fit Workout — Exercise module, Stage 3: roles & assignment
-- Sensitive: assignments reference a person's health plan. RLS is tested
-- for real in supabase/tests/w20fit_rls_isolation_test.sql — doctor A must
-- never see doctor B's patients.
--
-- `profiles` note: a generic `profiles` table already belongs to the running
-- app on this shared DB, so member metadata lives in w20fit_profiles. Role is
-- NOT stored on the self-writable profile row (that would let a member
-- self-promote); staff roles stay in w20fit_staff (admin-managed), and
-- "member" is simply the absence of a staff row.

create table if not exists public.w20fit_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text, email text, created_at timestamptz default now()
);
alter table public.w20fit_profiles enable row level security;
create policy w20fit_profiles_select on public.w20fit_profiles
  for select to authenticated using (id = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_profiles_insert on public.w20fit_profiles
  for insert to authenticated with check (id = auth.uid());
create policy w20fit_profiles_update on public.w20fit_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table if not exists public.w20fit_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.w20fit_exercise_plans(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  assigned_to_email text,
  assigned_by uuid references auth.users(id),
  tanggal_mulai date, tanggal_selesai date, catatan text,
  status text default 'pending' check (status in ('pending','aktif','selesai','dibatalkan')),
  created_at timestamptz default now()
);
create index if not exists w20fit_assign_to_idx on public.w20fit_plan_assignments(assigned_to);
create index if not exists w20fit_assign_by_idx on public.w20fit_plan_assignments(assigned_by);
create index if not exists w20fit_assign_email_idx on public.w20fit_plan_assignments(lower(assigned_to_email));
alter table public.w20fit_plan_assignments enable row level security;

-- SECURITY DEFINER helpers (bypass RLS to avoid recursion in policies)
create or replace function public.w20fit_owns_plan(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.w20fit_exercise_plans where id = p and created_by = auth.uid());
$$;
create or replace function public.w20fit_has_assignment(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.w20fit_plan_assignments where plan_id = p and assigned_to = auth.uid());
$$;
revoke all on function public.w20fit_owns_plan(uuid) from public;
revoke all on function public.w20fit_has_assignment(uuid) from public;
grant execute on function public.w20fit_owns_plan(uuid) to authenticated;
grant execute on function public.w20fit_has_assignment(uuid) to authenticated;

-- Assignments: member sees their own; the staff member who created it sees
-- theirs; admin sees all. This is the doctor-A-cannot-see-doctor-B rule.
create policy w20fit_assign_select on public.w20fit_plan_assignments
  for select to authenticated
  using (assigned_to = auth.uid() or assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_assign_insert on public.w20fit_plan_assignments
  for insert to authenticated
  with check (assigned_by = auth.uid() and public.w20fit_is_staff()
              and (public.w20fit_owns_plan(plan_id) or public.w20fit_my_role() = 'admin'));
create policy w20fit_assign_update on public.w20fit_plan_assignments
  for update to authenticated
  using (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin')
  with check (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_assign_delete on public.w20fit_plan_assignments
  for delete to authenticated
  using (assigned_by = auth.uid() or public.w20fit_my_role() = 'admin');

-- A member with an assignment can read the plan and its items (permissive
-- policies OR together with the Stage 2 owner/admin policies).
create policy w20fit_plans_select_assigned on public.w20fit_exercise_plans
  for select to authenticated using (public.w20fit_has_assignment(id));
create policy w20fit_plan_items_select_assigned on public.w20fit_exercise_plan_items
  for select to authenticated using (public.w20fit_has_assignment(plan_id));

-- Called by the app right after sign-in / sign-up: claims any pending
-- assignment addressed to the user's email, and upserts their profile.
create or replace function public.w20fit_claim_assignments()
returns integer language plpgsql security definer set search_path = public as $$
declare em text; cnt int;
begin
  select email into em from auth.users where id = auth.uid();
  if em is null then return 0; end if;
  insert into public.w20fit_profiles(id, email) values (auth.uid(), em)
    on conflict (id) do update set email = excluded.email;
  update public.w20fit_plan_assignments set assigned_to = auth.uid(), status = 'aktif'
   where assigned_to is null and status = 'pending' and lower(assigned_to_email) = lower(em);
  get diagnostics cnt = row_count;
  return cnt;
end; $$;

-- Assign a plan to a participant by email; resolves an existing account
-- server-side (SECURITY DEFINER) so auth.users is not exposed to the client.
create or replace function public.w20fit_assign_plan(p_plan uuid, p_email text, p_mulai date, p_catatan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid; aid uuid; em text;
begin
  em := lower(trim(p_email));
  if em is null or em = '' or position('@' in em) = 0 then raise exception 'invalid_email'; end if;
  if not public.w20fit_is_staff() then raise exception 'not_staff'; end if;
  if not (public.w20fit_owns_plan(p_plan) or public.w20fit_my_role() = 'admin') then raise exception 'not_plan_owner'; end if;
  select id into uid from auth.users where lower(email) = em limit 1;
  insert into public.w20fit_plan_assignments(plan_id, assigned_to, assigned_to_email, assigned_by, tanggal_mulai, catatan, status)
  values (p_plan, uid, em, auth.uid(), p_mulai, nullif(trim(coalesce(p_catatan,'')),''), case when uid is not null then 'aktif' else 'pending' end)
  returning id into aid;
  return jsonb_build_object('id', aid, 'existing', uid is not null);
end; $$;

revoke all on function public.w20fit_claim_assignments() from public;
revoke all on function public.w20fit_assign_plan(uuid, text, date, text) from public;
grant execute on function public.w20fit_claim_assignments() to authenticated;
grant execute on function public.w20fit_assign_plan(uuid, text, date, text) to authenticated;
-- w20fit_is_staff() is also anon-executable by default privileges; not needed for anon.
revoke execute on function public.w20fit_is_staff() from anon;
revoke execute on function public.w20fit_owns_plan(uuid) from anon;
revoke execute on function public.w20fit_has_assignment(uuid) from anon;
revoke execute on function public.w20fit_claim_assignments() from anon;
revoke execute on function public.w20fit_assign_plan(uuid, text, date, text) from anon;
