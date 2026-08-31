// TypeScript types for the 20fit Workout app's Supabase tables.
//
// Scope: only the tables this app owns. The Supabase project ("20FIT ALL DATA",
// cpvzwqptzcxnwzfzgrmt) is shared across many 20fit apps (~350 tables); a full
// generated dump would be noise here, so this file is hand-maintained for the
// w20fit_* tables plus the CMS blob. Regenerate the full set with
// `supabase gen types typescript` if you ever need the whole schema.

export type Uuid = string;
export type Timestamptz = string; // ISO 8601

/** Global CMS content blob (row id = 'default'). anon+authenticated read/write. */
export interface W20fitWorkoutCms {
  id: string;            // e.g. 'default'
  data: Record<string, unknown>; // jsonb: { types, programs, workouts, collections, series, hero, ... }
  updated_at: Timestamptz;
}

/** A favorited catalog item, owned by one user. */
export interface W20fitFavorite {
  id: Uuid;
  auth_user_id: Uuid;    // -> auth.users(id)
  item_type: string;     // 'session' | 'program' | 'collection' | ...
  item_id: string;       // content id from the CMS/seed
  created_at: Timestamptz;
}

/** A user-created playlist. */
export interface W20fitPlaylist {
  id: Uuid;
  auth_user_id: Uuid;    // -> auth.users(id)
  name: string;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

/** An item inside a playlist (ordered). */
export interface W20fitPlaylistItem {
  id: Uuid;
  playlist_id: Uuid;     // -> w20fit_playlists(id)
  auth_user_id: Uuid;    // -> auth.users(id), denormalized for RLS
  item_type: string;     // default 'session'
  item_id: string;
  position: number;
  created_at: Timestamptz;
}

/** A recorded session completion (history for progress/streaks). */
export interface W20fitCompletion {
  id: Uuid;
  auth_user_id: Uuid;    // -> auth.users(id)
  item_type: string;     // default 'session'
  item_id: string;
  completed_at: Timestamptz;
  duration_seconds: number | null;
  kcal: number | null;
  created_at: Timestamptz;
}

/** Insert shapes (server fills id/created_at/updated_at; auth_user_id = auth.uid()). */
export type W20fitFavoriteInsert = Pick<W20fitFavorite, 'auth_user_id' | 'item_type' | 'item_id'>;
export type W20fitPlaylistInsert = Pick<W20fitPlaylist, 'auth_user_id' | 'name'>;
export type W20fitPlaylistItemInsert =
  Pick<W20fitPlaylistItem, 'playlist_id' | 'auth_user_id' | 'item_id'> &
  Partial<Pick<W20fitPlaylistItem, 'item_type' | 'position'>>;
export type W20fitCompletionInsert =
  Pick<W20fitCompletion, 'auth_user_id' | 'item_id'> &
  Partial<Pick<W20fitCompletion, 'item_type' | 'completed_at' | 'duration_seconds' | 'kcal'>>;
