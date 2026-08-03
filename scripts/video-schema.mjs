// TUGAS 2 — Video data schema + invariants.
//
// This repo has no TypeScript/build step (it ships one bundled HTML file), so
// the "types" are JSDoc typedefs and the Zod-style validation is a set of
// zero-dependency runtime guards that THROW (never warn). The central rule —
// a third_party_embed video MUST carry attribution — is enforced here and is
// impossible to disable via config or flag (Aturan Keras #4).
//
// Shared by scripts/ingest-videos.mjs and scripts/revalidate-videos.mjs.

/** @typedef {'owned'|'third_party_embed'} VideoSource */

/**
 * @typedef {Object} VideoAttribution
 * @property {string} creatorName
 * @property {string} [creatorLegalEntity]
 * @property {string} channelUrl          - https://www.youtube.com/channel/...
 * @property {string} videoUrl            - canonical https://www.youtube.com/watch?v=...
 * @property {string} videoTitle
 */

/**
 * @typedef {Object} ExerciseVideo
 * @property {'youtube'} provider
 * @property {string} videoId
 * @property {string} channelId
 * @property {VideoSource} source
 * @property {VideoAttribution|null} attribution  - MUST be non-null when source === 'third_party_embed'
 * @property {number} [startSec]
 * @property {number} [endSec]
 * @property {number} durationSec
 * @property {boolean} embeddable
 * @property {string} privacyStatus
 * @property {string} lastVerifiedAt              - ISO 8601
 */

// Verified sources — pakai persis ini. videoIds are NEVER written here; they
// only ever come from the YouTube Data API (Aturan Keras #3).
export const SOURCES = [
  {
    creatorName: '20FIT',
    channelId: 'UC8zo7jvEtFzX6LBvg-JapdQ',
    uploadsPlaylistId: 'UU8zo7jvEtFzX6LBvg-JapdQ',
    source: /** @type {VideoSource} */ ('owned'),
  },
  {
    creatorName: 'Chloe Ting',
    channelId: 'UCCgLoMYIyP0U56dEhEL1wXQ',
    uploadsPlaylistId: 'UUCgLoMYIyP0U56dEhEL1wXQ',
    source: /** @type {VideoSource} */ ('third_party_embed'),
  },
  {
    creatorName: 'Workout With Roxanne',
    channelId: 'UCYz_Au_UTbenuIeQBFHnu3g',
    uploadsPlaylistId: 'UUYz_Au_UTbenuIeQBFHnu3g',
    source: /** @type {VideoSource} */ ('third_party_embed'),
    creatorLegalEntity: 'ROX HEALTH GROUP PTY LTD',
    // NOTE: this channel has YouTube Membership. Members-only videos must never
    // enter the catalog. They are excluded by the privacyStatus !== 'public'
    // filter in the ingest (members-only items are not public).
  },
];

export const SOURCE_BY_CHANNEL = Object.fromEntries(SOURCES.map((s) => [s.channelId, s]));

export class VideoSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VideoSchemaError';
  }
}

const isNonEmptyStr = (v) => typeof v === 'string' && v.length > 0;
const isNonNegNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Throws unless `a` is null or a fully-formed VideoAttribution. */
export function validateAttribution(a) {
  if (a === null) return;
  if (typeof a !== 'object') throw new VideoSchemaError('attribution must be an object or null');
  for (const k of ['creatorName', 'channelUrl', 'videoUrl', 'videoTitle']) {
    if (!isNonEmptyStr(a[k])) throw new VideoSchemaError(`attribution.${k} must be a non-empty string`);
  }
  if (a.creatorLegalEntity !== undefined && !isNonEmptyStr(a.creatorLegalEntity)) {
    throw new VideoSchemaError('attribution.creatorLegalEntity must be a non-empty string when present');
  }
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=/.test(a.videoUrl)) {
    throw new VideoSchemaError(`attribution.videoUrl must be a canonical watch URL, got: ${a.videoUrl}`);
  }
}

/**
 * Validate a single record. Throws on any violation. THE hard invariant:
 * source === 'third_party_embed'  =>  attribution !== null.
 * @param {ExerciseVideo} v
 * @returns {ExerciseVideo}
 */
export function assertVideoRecord(v) {
  if (!v || typeof v !== 'object') throw new VideoSchemaError('record must be an object');
  if (v.provider !== 'youtube') throw new VideoSchemaError('provider must be "youtube"');
  if (!isNonEmptyStr(v.videoId)) throw new VideoSchemaError('videoId must be a non-empty string');
  if (!isNonEmptyStr(v.channelId)) throw new VideoSchemaError('channelId must be a non-empty string');
  if (v.source !== 'owned' && v.source !== 'third_party_embed') {
    throw new VideoSchemaError(`source must be 'owned' | 'third_party_embed', got: ${v.source}`);
  }
  if (typeof v.embeddable !== 'boolean') throw new VideoSchemaError('embeddable must be a boolean');
  if (!isNonEmptyStr(v.privacyStatus)) throw new VideoSchemaError('privacyStatus must be a non-empty string');
  if (!isNonNegNum(v.durationSec)) throw new VideoSchemaError('durationSec must be a number >= 0');
  if (!isNonEmptyStr(v.lastVerifiedAt)) throw new VideoSchemaError('lastVerifiedAt must be a non-empty ISO string');
  if (v.startSec !== undefined && !isNonNegNum(v.startSec)) throw new VideoSchemaError('startSec must be a number >= 0');
  if (v.endSec !== undefined && !isNonNegNum(v.endSec)) throw new VideoSchemaError('endSec must be a number >= 0');
  if (v.startSec !== undefined && v.endSec !== undefined && v.endSec <= v.startSec) {
    throw new VideoSchemaError('endSec must be greater than startSec');
  }
  validateAttribution(v.attribution);

  // ===== THE INVARIANT (not a warning) =====
  if (v.source === 'third_party_embed' && v.attribution === null) {
    throw new VideoSchemaError(
      `INVARIANT VIOLATED: third_party_embed video "${v.videoId}" has attribution === null`,
    );
  }
  return v;
}

/** Validate a whole catalog array. Throws with the offending index/videoId. */
export function assertCatalog(list) {
  if (!Array.isArray(list)) throw new VideoSchemaError('catalog must be an array');
  list.forEach((v, i) => {
    try {
      assertVideoRecord(v);
    } catch (e) {
      throw new VideoSchemaError(`record[${i}] (videoId=${v && v.videoId}): ${e.message}`);
    }
  });
  return list;
}

/** ISO 8601 duration (e.g. "PT1H2M30S") -> seconds. Returns NaN if unparseable. */
export function iso8601DurationToSec(d) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || '');
  if (!m) return NaN;
  const [, days, h, min, s] = m;
  return (+(days || 0)) * 86400 + (+(h || 0)) * 3600 + (+(min || 0)) * 60 + (+(s || 0));
}

/**
 * Build the attribution block for a record. Returns null for owned content;
 * a fully-formed VideoAttribution for third_party_embed.
 * @param {{creatorName:string, channelId:string, source:VideoSource, creatorLegalEntity?:string}} src
 * @param {{title?:string}} snippet
 * @param {string} videoId
 * @returns {VideoAttribution|null}
 */
export function buildAttribution(src, snippet, videoId) {
  if (src.source === 'owned') return null;
  /** @type {VideoAttribution} */
  const a = {
    creatorName: src.creatorName,
    channelUrl: `https://www.youtube.com/channel/${src.channelId}`,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoTitle: (snippet && snippet.title) || '',
  };
  if (src.creatorLegalEntity) a.creatorLegalEntity = src.creatorLegalEntity;
  return a;
}
