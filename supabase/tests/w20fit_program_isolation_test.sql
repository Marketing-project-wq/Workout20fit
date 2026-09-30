-- RLS isolation test for the patient-centric program flow.
-- Run inside a transaction that is rolled back; asserts that a doctor cannot
-- see another doctor's patients/programs/phases, and that a patient sees their
-- own program after claim-on-login. Verified green against project
-- cpvzwqptzcxnwzfzgrmt on 2026-09-08.
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000aa';
  b uuid := '00000000-0000-0000-0000-0000000000bb';
  pat uuid := '00000000-0000-0000-0000-0000000000cc';
  proga uuid; progb uuid; fasea uuid;
  n_a_sees int; n_b_sees int; n_pat_items int; n_pat_sees int;
begin
  insert into auth.users(id) values (a),(b),(pat) on conflict do nothing;
  insert into public.w20fit_staff(user_id, role, nama) values (a,'dokter','DrA'),(b,'dokter','DrB')
    on conflict (user_id) do update set role=excluded.role;
  update auth.users set email='patientx@klinik.test' where id=pat;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a::text)::text, true);
  proga := (public.w20fit_assign_program('patientx@klinik.test','Program A','')->>'id')::uuid;
  insert into public.w20fit_exercise_plans(nama, fase_nama, urutan, program_id, created_by, is_template)
    values ('Fase 1','Fase 1',1,proga,a,false) returning id into fasea;
  insert into public.w20fit_exercise_plan_items(plan_id, exercise_id, urutan, sets, reps)
    values (fasea, null, 1, 3, 10);

  perform set_config('request.jwt.claims', json_build_object('sub',b::text)::text, true);
  progb := (public.w20fit_assign_program('someoneelse@klinik.test','Program B','')->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub',a::text)::text, true);
  select count(*) into n_a_sees from public.w20fit_patient_programs;

  perform set_config('request.jwt.claims', json_build_object('sub',b::text)::text, true);
  select count(*) into n_b_sees from public.w20fit_patient_programs where id=proga;
  select count(*) into n_pat_items from public.w20fit_exercise_plan_items where plan_id=fasea;

  perform set_config('request.jwt.claims', json_build_object('sub',pat::text)::text, true);
  perform public.w20fit_claim_assignments();
  select count(*) into n_pat_sees from public.w20fit_patient_programs where id=proga;

  if n_a_sees<>1 or n_b_sees<>0 or n_pat_items<>0 or n_pat_sees<>1 then
    raise exception 'RLS ISOLATION FAILED: a=% b=% items=% pat=%', n_a_sees, n_b_sees, n_pat_items, n_pat_sees;
  end if;
  raise notice 'RLS ISOLATION OK: DrA sees 1, DrB sees 0 of A, DrB reads 0 items, patient sees 1';
  rollback;
end $$;
