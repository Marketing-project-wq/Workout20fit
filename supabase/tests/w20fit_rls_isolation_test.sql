-- RLS isolation test for the Exercise-module assignments (Stage 3).
-- Runs entirely inside a transaction and ROLLS BACK, so it leaves no data.
-- Verifies the core privacy guarantee: doctor A can never see doctor B's
-- patients; a member sees only their own assignment and the plan assigned to
-- them; and the email-claim-on-signup flow attaches a pending assignment to a
-- newly created account.
--
-- Run with the Supabase SQL editor or MCP execute_sql. All rows in the final
-- result should have pass = true.
begin;
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','doca@test.local'),
  ('22222222-2222-2222-2222-222222222222','docb@test.local'),
  ('33333333-3333-3333-3333-333333333333','mema@test.local'),
  ('44444444-4444-4444-4444-444444444444','memb@test.local'),
  ('55555555-5555-5555-5555-555555555555','memc@test.local');
insert into public.w20fit_staff(user_id,role) values
  ('11111111-1111-1111-1111-111111111111','dokter'),
  ('22222222-2222-2222-2222-222222222222','dokter');
insert into public.w20fit_exercise_plans(id,nama,created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Plan A','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Plan B','22222222-2222-2222-2222-222222222222');
insert into public.w20fit_plan_assignments(plan_id,assigned_to,assigned_to_email,assigned_by,status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','mema@test.local','11111111-1111-1111-1111-111111111111','aktif'),
  ('bbbbbbbb-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','memb@test.local','22222222-2222-2222-2222-222222222222','aktif'),
  ('aaaaaaaa-0000-0000-0000-000000000001',null,'memc@test.local','11111111-1111-1111-1111-111111111111','pending');

create temp table _res(label text, val int, expected int) on commit drop;
grant all on _res to authenticated;

set local role authenticated; set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into _res values ('docA_sees_assignments',(select count(*) from public.w20fit_plan_assignments),2);
insert into _res values ('docA_sees_docB_rows',(select count(*) from public.w20fit_plan_assignments where assigned_by='22222222-2222-2222-2222-222222222222'),0);
insert into _res values ('docA_sees_plans',(select count(*) from public.w20fit_exercise_plans),1);
reset role; reset request.jwt.claims;

set local role authenticated; set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
insert into _res values ('docB_sees_assignments',(select count(*) from public.w20fit_plan_assignments),1);
insert into _res values ('docB_sees_docA_rows',(select count(*) from public.w20fit_plan_assignments where assigned_by='11111111-1111-1111-1111-111111111111'),0);
reset role; reset request.jwt.claims;

set local role authenticated; set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';
insert into _res values ('memA_sees_assignments',(select count(*) from public.w20fit_plan_assignments),1);
insert into _res values ('memA_sees_planA',(select count(*) from public.w20fit_exercise_plans where id='aaaaaaaa-0000-0000-0000-000000000001'),1);
insert into _res values ('memA_sees_planB',(select count(*) from public.w20fit_exercise_plans where id='bbbbbbbb-0000-0000-0000-000000000002'),0);
reset role; reset request.jwt.claims;

set local role authenticated; set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';
insert into _res values ('memC_claimed_count',(select public.w20fit_claim_assignments()),1);
insert into _res values ('memC_sees_assignments_after',(select count(*) from public.w20fit_plan_assignments),1);
reset role; reset request.jwt.claims;

select label, val, expected, (val=expected) as pass from _res order by label;
rollback;
