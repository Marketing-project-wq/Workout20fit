-- 20fit Workout app — per-user data (favorites, playlists, completions)
-- Applied to shared project "20FIT ALL DATA" (cpvzwqptzcxnwzfzgrmt) on 2026-08-31.
-- Namespaced `w20fit_` in schema public. Per-user rows tie to auth.users via
-- auth_user_id (the my20fit_* convention on this database). RLS: auth.uid() = auth_user_id.
--
-- NOTE: the workout app must hold a real Supabase Auth session for these tables to
-- be usable. Until Supabase Auth is wired into the bundle (replacing the current
-- localStorage login), auth.uid() is null from the app and these tables stay empty.

-- shared updated_at trigger (namespaced to avoid collision on the shared DB)
create or replace function public.w20fit_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ w20fit_favorites ============
create table if not exists public.w20fit_favorites (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,          -- 'session' | 'program' | 'collection' | ...
  item_id text not null,            -- content id from the CMS/seed (e.g. 'gen123', 'pg-...')
  created_at timestamptz not null default now(),
  unique (auth_user_id, item_type, item_id)
);
create index if not exists w20fit_favorites_user_idx on public.w20fit_favorites(auth_user_id);
alter table public.w20fit_favorites enable row level security;
create policy "w20fit_fav_select" on public.w20fit_favorites for select using (auth.uid() = auth_user_id);
create policy "w20fit_fav_insert" on public.w20fit_favorites for insert with check (auth.uid() = auth_user_id);
create policy "w20fit_fav_update" on public.w20fit_favorites for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy "w20fit_fav_delete" on public.w20fit_favorites for delete using (auth.uid() = auth_user_id);

-- ============ w20fit_playlists ============
create table if not exists public.w20fit_playlists (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists w20fit_playlists_user_idx on public.w20fit_playlists(auth_user_id);
create trigger w20fit_playlists_set_updated_at before update on public.w20fit_playlists
  for each row execute function public.w20fit_set_updated_at();
alter table public.w20fit_playlists enable row level security;
create policy "w20fit_pl_select" on public.w20fit_playlists for select using (auth.uid() = auth_user_id);
create policy "w20fit_pl_insert" on public.w20fit_playlists for insert with check (auth.uid() = auth_user_id);
create policy "w20fit_pl_update" on public.w20fit_playlists for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy "w20fit_pl_delete" on public.w20fit_playlists for delete using (auth.uid() = auth_user_id);

-- ============ w20fit_playlist_items ============
create table if not exists public.w20fit_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.w20fit_playlists(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,  -- denormalized for simple RLS
  item_type text not null default 'session',
  item_id text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (playlist_id, item_id)
);
create index if not exists w20fit_playlist_items_playlist_idx on public.w20fit_playlist_items(playlist_id);
create index if not exists w20fit_playlist_items_user_idx on public.w20fit_playlist_items(auth_user_id);
alter table public.w20fit_playlist_items enable row level security;
create policy "w20fit_pli_select" on public.w20fit_playlist_items for select using (auth.uid() = auth_user_id);
create policy "w20fit_pli_insert" on public.w20fit_playlist_items for insert with check (auth.uid() = auth_user_id);
create policy "w20fit_pli_update" on public.w20fit_playlist_items for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy "w20fit_pli_delete" on public.w20fit_playlist_items for delete using (auth.uid() = auth_user_id);

-- ============ w20fit_completions ============
create table if not exists public.w20fit_completions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null default 'session',
  item_id text not null,
  completed_at timestamptz not null default now(),
  duration_seconds integer,
  kcal integer,
  created_at timestamptz not null default now()
);
create index if not exists w20fit_completions_user_idx on public.w20fit_completions(auth_user_id);
create index if not exists w20fit_completions_user_completed_idx on public.w20fit_completions(auth_user_id, completed_at desc);
alter table public.w20fit_completions enable row level security;
create policy "w20fit_cmp_select" on public.w20fit_completions for select using (auth.uid() = auth_user_id);
create policy "w20fit_cmp_insert" on public.w20fit_completions for insert with check (auth.uid() = auth_user_id);
create policy "w20fit_cmp_update" on public.w20fit_completions for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy "w20fit_cmp_delete" on public.w20fit_completions for delete using (auth.uid() = auth_user_id);
