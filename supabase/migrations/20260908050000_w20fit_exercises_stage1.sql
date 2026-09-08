-- 20fit Workout — Exercise module, Stage 1: Exercise Library
-- Applied to the shared project "20FIT ALL DATA" (cpvzwqptzcxnwzfzgrmt).
--
-- Tables are prefixed w20fit_ to match this module's existing tables
-- (w20fit_workout_cms, w20fit_user) and avoid collisions on the shared
-- database — a generic `exercises`/`profiles` would clash (a `profiles`
-- table already belongs to the running app).
--
-- Roles: the module had no role source yet, but Stage 1's RLS requires
-- "write only for admin & coach". w20fit_staff is that minimal source —
-- members need no row (absence = 'member'); only staff are listed. Stage 3
-- builds the full profiles / assignment model on top of this.

-- ---------- role source ----------
create table if not exists public.w20fit_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','coach','dokter')),
  nama text,
  created_at timestamptz default now()
);
alter table public.w20fit_staff enable row level security;

-- SECURITY DEFINER so it bypasses RLS on w20fit_staff (no recursion)
create or replace function public.w20fit_my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.w20fit_staff where user_id = auth.uid() limit 1), 'member');
$$;
revoke all on function public.w20fit_my_role() from public;
grant execute on function public.w20fit_my_role() to authenticated;

create or replace function public.w20fit_can_edit_exercises()
returns boolean language sql stable security definer set search_path = public as $$
  select public.w20fit_my_role() in ('admin','coach');
$$;
revoke all on function public.w20fit_can_edit_exercises() from public;
grant execute on function public.w20fit_can_edit_exercises() to authenticated;

create policy w20fit_staff_select_self on public.w20fit_staff
  for select to authenticated using (user_id = auth.uid() or public.w20fit_my_role() = 'admin');
create policy w20fit_staff_admin_write on public.w20fit_staff
  for all to authenticated using (public.w20fit_my_role() = 'admin') with check (public.w20fit_my_role() = 'admin');

-- Seed the module owner as admin so the CMS can write immediately
insert into public.w20fit_staff (user_id, role, nama)
values ('b8846280-e20f-4cae-a3d7-500c69dd0687', 'admin', 'Zidni')
on conflict (user_id) do update set role = 'admin';

-- ---------- exercise library ----------
create table if not exists public.w20fit_exercises (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  slug text unique not null,
  video_url text,
  thumbnail_url text,
  deskripsi text,
  cue_teknik text[] default '{}',
  otot_target text[] default '{}',
  level text check (level in ('pemula','menengah','lanjutan')),
  alat text[] default '{}',
  durasi_detik int,
  kontraindikasi text,           -- internal note for coach/doctor; never shown to end users
  status text default 'draft' check (status in ('draft','terbit')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists w20fit_exercises_status_idx on public.w20fit_exercises(status);
create index if not exists w20fit_exercises_level_idx on public.w20fit_exercises(level);

alter table public.w20fit_exercises enable row level security;

-- Published exercises are readable by any authenticated user; staff read drafts too
create policy w20fit_exercises_select on public.w20fit_exercises
  for select to authenticated
  using (status = 'terbit' or public.w20fit_can_edit_exercises());
-- Writes restricted to admin + coach
create policy w20fit_exercises_insert on public.w20fit_exercises
  for insert to authenticated with check (public.w20fit_can_edit_exercises());
create policy w20fit_exercises_update on public.w20fit_exercises
  for update to authenticated using (public.w20fit_can_edit_exercises()) with check (public.w20fit_can_edit_exercises());
create policy w20fit_exercises_delete on public.w20fit_exercises
  for delete to authenticated using (public.w20fit_can_edit_exercises());

create or replace function public.w20fit_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists w20fit_exercises_touch on public.w20fit_exercises;
create trigger w20fit_exercises_touch before update on public.w20fit_exercises
  for each row execute function public.w20fit_touch_updated_at();

-- ---------- storage bucket (video clips + thumbnails) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'w20fit-exercises', 'w20fit-exercises', true,
  104857600,  -- 100 MB per file (short clips)
  array['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = true, file_size_limit = 104857600,
  allowed_mime_types = array['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp'];

create policy w20fit_ex_storage_read on storage.objects
  for select using (bucket_id = 'w20fit-exercises');
create policy w20fit_ex_storage_write on storage.objects
  for insert to authenticated with check (bucket_id = 'w20fit-exercises' and public.w20fit_can_edit_exercises());
create policy w20fit_ex_storage_update on storage.objects
  for update to authenticated using (bucket_id = 'w20fit-exercises' and public.w20fit_can_edit_exercises());
create policy w20fit_ex_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'w20fit-exercises' and public.w20fit_can_edit_exercises());
