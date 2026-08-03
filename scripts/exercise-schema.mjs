// TUGAS 1 — Master exercise-library schema + invariants.
//
// Design (approved): the master library is keyed by a stable slug and owns the
// SHARED bits of a movement — its identity and its VIDEO. A movement's video is
// defined here ONCE and every program that uses that movement resolves it by
// slug, so "change a video in one place → all programs update" holds. Per-program
// coaching text (howTo/mistakes/tips) is intentionally left on each program's
// own exercise object (those legitimately differ program-to-program), so this
// migration is non-lossy.
//
// No TypeScript/build in this repo → JSDoc typedefs + zero-dependency runtime
// guards that THROW. The central rule (third_party_embed ⇒ attribution) is
// enforced here and cannot be disabled by config/flag (Aturan Keras #4).

/** @typedef {'owned'|'third_party_embed'} VideoSource */

/**
 * @typedef {Object} VideoAttribution
 * @property {string} creatorName
 * @property {string} channelUrl
 * @property {string} videoUrl     - canonical https://www.youtube.com/watch?v=...
 * @property {string} videoTitle
 */

/**
 * @typedef {Object} ExerciseVideo
 * @property {'youtube'} provider
 * @property {string} videoId
 * @property {VideoSource} source
 * @property {VideoAttribution|null} attribution - MUST be non-null when source === 'third_party_embed'
 * @property {number} [startSec]
 * @property {number} [endSec]
 * @property {boolean} embeddable
 * @property {boolean} verifiedByCoach          - default false
 * @property {string} lastVerifiedAt            - ISO 8601
 */

/**
 * Master library record — one per unique movement across the WHOLE platform.
 * @typedef {Object} Exercise
 * @property {string} id        - slug, e.g. 'kettlebell-swing'
 * @property {string} name
 * @property {string} equipment
 * @property {ExerciseVideo|null} video   - null is a normal, valid state
 */

/**
 * A program references a library exercise + carries contextual params only.
 * @typedef {Object} ProgramExercise
 * @property {string} exerciseId              - FK to Exercise.id (slug)
 * @property {'warmup'|'main'|'cooldown'} section
 * @property {number} order
 * @property {number} [durationSec]           - may differ per program
 * @property {number} [reps]
 */

export class VideoSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VideoSchemaError';
  }
}

const isNonEmptyStr = (v) => typeof v === 'string' && v.length > 0;
const isNonNegNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Stable slug from a movement name. Keeps genuinely-different names distinct
 *  (e.g. "Farmer Carry" vs "Farmer's Carry" → farmer-carry vs farmers-carry). */
export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/['’`]/g, '')           // drop apostrophes (Child's → childs)
    .replace(/[^a-z0-9]+/g, '-')     // everything else → hyphen
    .replace(/^-+|-+$/g, '');
}

/** Throws unless `a` is null or a fully-formed VideoAttribution. */
export function validateAttribution(a) {
  if (a === null) return;
  if (typeof a !== 'object') throw new VideoSchemaError('attribution must be an object or null');
  for (const k of ['creatorName', 'channelUrl', 'videoUrl', 'videoTitle']) {
    if (!isNonEmptyStr(a[k])) throw new VideoSchemaError(`attribution.${k} must be a non-empty string`);
  }
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=/.test(a.videoUrl)) {
    throw new VideoSchemaError(`attribution.videoUrl must be a canonical watch URL, got: ${a.videoUrl}`);
  }
}

/**
 * Validate an ExerciseVideo. Throws on any violation. THE hard invariant:
 * source === 'third_party_embed' ⇒ attribution !== null.
 * @param {ExerciseVideo} v
 */
export function assertExerciseVideo(v) {
  if (!v || typeof v !== 'object') throw new VideoSchemaError('video must be an object');
  if (v.provider !== 'youtube') throw new VideoSchemaError('provider must be "youtube"');
  if (!isNonEmptyStr(v.videoId)) throw new VideoSchemaError('videoId must be a non-empty string');
  if (v.source !== 'owned' && v.source !== 'third_party_embed') {
    throw new VideoSchemaError(`source must be 'owned' | 'third_party_embed', got: ${v.source}`);
  }
  if (typeof v.embeddable !== 'boolean') throw new VideoSchemaError('embeddable must be a boolean');
  if (typeof v.verifiedByCoach !== 'boolean') throw new VideoSchemaError('verifiedByCoach must be a boolean');
  if (!isNonEmptyStr(v.lastVerifiedAt)) throw new VideoSchemaError('lastVerifiedAt must be a non-empty ISO string');
  if (v.startSec !== undefined && !isNonNegNum(v.startSec)) throw new VideoSchemaError('startSec must be a number >= 0');
  if (v.endSec !== undefined && !isNonNegNum(v.endSec)) throw new VideoSchemaError('endSec must be a number >= 0');
  if (v.startSec !== undefined && v.endSec !== undefined && v.endSec <= v.startSec) {
    throw new VideoSchemaError('endSec must be greater than startSec');
  }
  validateAttribution(v.attribution);

  // ===== THE INVARIANT (not a warning) =====
  if (v.source === 'third_party_embed' && v.attribution === null) {
    throw new VideoSchemaError(`INVARIANT VIOLATED: third_party_embed video "${v.videoId}" has attribution === null`);
  }
  return v;
}

/** Validate a master Exercise record (video may be null). */
export function assertExercise(ex) {
  if (!ex || typeof ex !== 'object') throw new VideoSchemaError('exercise must be an object');
  if (!isNonEmptyStr(ex.id)) throw new VideoSchemaError('exercise.id (slug) must be a non-empty string');
  if (!isNonEmptyStr(ex.name)) throw new VideoSchemaError('exercise.name must be a non-empty string');
  if (typeof ex.equipment !== 'string') throw new VideoSchemaError('exercise.equipment must be a string');
  if (ex.video !== null) assertExerciseVideo(ex.video);
  return ex;
}

/** Validate the whole library array (unique slugs, each record valid). */
export function assertLibrary(list) {
  if (!Array.isArray(list)) throw new VideoSchemaError('library must be an array');
  const seen = new Set();
  list.forEach((ex, i) => {
    try {
      assertExercise(ex);
      if (seen.has(ex.id)) throw new VideoSchemaError(`duplicate slug "${ex.id}"`);
      seen.add(ex.id);
    } catch (e) {
      throw new VideoSchemaError(`library[${i}] (${ex && ex.id}): ${e.message}`);
    }
  });
  return list;
}

/** Validate a ProgramExercise reference. */
export function assertProgramExercise(pe) {
  if (!pe || typeof pe !== 'object') throw new VideoSchemaError('programExercise must be an object');
  if (!isNonEmptyStr(pe.exerciseId)) throw new VideoSchemaError('exerciseId must be a non-empty string');
  if (!['warmup', 'main', 'cooldown'].includes(pe.section)) {
    throw new VideoSchemaError(`section must be warmup|main|cooldown, got: ${pe.section}`);
  }
  if (typeof pe.order !== 'number') throw new VideoSchemaError('order must be a number');
  if (pe.durationSec !== undefined && !isNonNegNum(pe.durationSec)) throw new VideoSchemaError('durationSec must be >= 0');
  if (pe.reps !== undefined && !isNonNegNum(pe.reps)) throw new VideoSchemaError('reps must be >= 0');
  return pe;
}
