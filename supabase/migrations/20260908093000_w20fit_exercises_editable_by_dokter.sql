-- Let doctors (dokter), not just admin/coach, add & edit exercises and embed/
-- upload their videos. This one helper is what the w20fit_exercises table RLS
-- and all four w20fit-exercises storage-object policies check, so updating it
-- opens the whole exercise-authoring path (metadata, video URL, upload) to
-- doctors in one place. Verified with a rolled-back test: a dokter can insert
-- an exercise, a plain member cannot.
create or replace function public.w20fit_can_edit_exercises()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.w20fit_my_role() in ('admin','coach','dokter');
$function$;
