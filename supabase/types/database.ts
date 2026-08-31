// TypeScript types for the 20fit Workout app's Supabase tables.
//
// Scope: only the tables this app owns. The Supabase project ("20FIT ALL DATA",
// cpvzwqptzcxnwzfzgrmt) is shared across many 20fit apps (~350 tables); a full
// generated dump would be noise here, so this file is hand-maintained.
// Regenerate the full set with `supabase gen types typescript` if ever needed.

export type Uuid = string;
export type Timestamptz = string; // ISO 8601

/** Global CMS content blob (row id = 'default'). anon+authenticated read/write. */
export interface W20fitWorkoutCms {
  id: string; // e.g. 'default'
  data: Record<string, unknown>; // jsonb: { types, programs, workouts, collections, series, hero, ... }
  updated_at: Timestamptz;
}

/** All per-user activity for the workout app, stored as one JSON blob. */
export interface W20fitUserActivity {
  favorites: string[];              // favorited item ids
  playlists: Array<{ id: number; name: string; workoutIds: string[] }>;
  playlistSeq: number;              // next playlist id
  history: Array<{ id: string; at: number }>; // recently opened (most-recent first)
}

/** One row per user: login identity (from auth.users) + activity. No passwords. */
export interface W20fitUser {
  id: Uuid;
  auth_user_id: Uuid;   // -> auth.users(id), unique
  email: string | null;
  full_name: string | null;
  data: W20fitUserActivity;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

/** Upsert shape (on_conflict=auth_user_id); server fills id/created_at/updated_at. */
export type W20fitUserUpsert = Pick<W20fitUser, 'auth_user_id'> &
  Partial<Pick<W20fitUser, 'email' | 'full_name' | 'data'>>;
