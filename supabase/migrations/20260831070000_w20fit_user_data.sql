-- 20fit Workout app — per-user data in a SINGLE table: public.w20fit_user
-- Applied to the shared project "20FIT ALL DATA" (cpvzwqptzcxnwzfzgrmt).
--
-- One row per user: login identity (from auth.users) + all workout activity
-- (favorites, playlists, recents) in a jsonb column. NO passwords are stored
-- here — credentials are managed by Supabase Auth (auth.users).
--
-- Tied to auth.users via auth_user_id; RLS: auth.uid() = auth_user_id
-- (the my20fit_* convention on this database).
--
-- NOTE: an earlier iteration split this into four tables (w20fit_favorites,
-- w20fit_playlists, w20fit_playlist_items, w20fit_completions); they were
-- consolidated into w20fit_user below at the product owner's request. This file
-- documents the final state.

-- shared updated_at trigger (namespaced to avoid collision on the shared DB)
create or replace function public.w20fit_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.w20fit_user (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  data jsonb not null default '{}'::jsonb,  -- { favorites:[], playlists:[], playlistSeq, history:[] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists w20fit_user_auth_idx on public.w20fit_user(auth_user_id);
create trigger w20fit_user_set_updated_at before update on public.w20fit_user
  for each row execute function public.w20fit_set_updated_at();

alter table public.w20fit_user enable row level security;
create policy "w20fit_user_select" on public.w20fit_user for select using (auth.uid() = auth_user_id);
create policy "w20fit_user_insert" on public.w20fit_user for insert with check (auth.uid() = auth_user_id);
create policy "w20fit_user_update" on public.w20fit_user for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy "w20fit_user_delete" on public.w20fit_user for delete using (auth.uid() = auth_user_id);
