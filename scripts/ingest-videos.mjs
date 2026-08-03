#!/usr/bin/env node
// TUGAS 1 — Ingest the YouTube catalog for the three verified sources.
//
//   YOUTUBE_API_KEY=xxxxx node scripts/ingest-videos.mjs
//
// Pulls EVERY item from each channel's uploads playlist (playlistItems.list,
// paginated), hydrates them via videos.list (status,contentDetails,snippet),
// applies the mandatory filters, and writes data/video-catalog.json.
//
// Rules honored:
//   * video IDs come ONLY from the API — none are ever hardcoded (Aturan Keras #3)
//   * API key from env YOUTUBE_API_KEY — never hardcoded, never committed
//   * no silent failures — quota (403), not-found (404) and timeouts throw loudly
//
// Zero runtime dependencies: uses Node 18+ global fetch.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCES,
  buildAttribution,
  iso8601DurationToSec,
  assertCatalog,
} from './video-schema.mjs';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const KEY = process.env.YOUTUBE_API_KEY;
const TIMEOUT_MS = 20000;
const MIN_DURATION_SEC = 30; // Shorts cutoff (owned content is exempt)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'video-catalog.json');

if (!KEY) {
  console.error('\n[ingest] FATAL: YOUTUBE_API_KEY is not set.');
  console.error('  Run it like:  YOUTUBE_API_KEY=your_key node scripts/ingest-videos.mjs');
  console.error('  Get a key: Google Cloud Console → APIs & Services → enable "YouTube Data API v3" → create API key.');
  console.error('  Never hardcode or commit the key.\n');
  process.exit(1);
}

class ApiError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

async function apiGet(endpoint, params) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', KEY);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ApiError(`Timeout after ${TIMEOUT_MS}ms calling ${endpoint}.`, { status: 'timeout' });
    }
    throw new ApiError(`Network error calling ${endpoint}: ${e.message}`, { status: 'network' });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* fall through to status handling below */
  }

  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason || '';
    const message = json?.error?.message || res.statusText || 'unknown error';
    if (res.status === 403 && /quota/i.test(`${reason} ${message}`)) {
      throw new ApiError(
        `YouTube quota exceeded (403, reason="${reason}"). Wait for the daily reset (midnight PT) or use another project's key.`,
        { status: 403, reason },
      );
    }
    if (res.status === 404) {
      throw new ApiError(
        `Not found (404) on ${endpoint}: ${message} [${reason}]. Check the channel/playlist ID.`,
        { status: 404, reason },
      );
    }
    if (res.status === 403) {
      throw new ApiError(
        `Forbidden (403) on ${endpoint}: ${message} [${reason}]. Is the API key valid and YouTube Data API v3 enabled?`,
        { status: 403, reason },
      );
    }
    throw new ApiError(`HTTP ${res.status} on ${endpoint}: ${message} [${reason}]`, { status: res.status, reason });
  }
  return json;
}

// playlistItems.list, paginated over nextPageToken until exhausted.
async function listAllPlaylistVideoIds(uploadsPlaylistId) {
  const ids = [];
  let pageToken = '';
  do {
    const params = { part: 'snippet', maxResults: '50', playlistId: uploadsPlaylistId };
    if (pageToken) params.pageToken = pageToken;
    const data = await apiGet('playlistItems', params);
    for (const item of data.items || []) {
      const vid = item?.snippet?.resourceId?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return ids;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// videos.list in batches of 50 (part=status,contentDetails,snippet).
async function fetchVideoDetails(videoIds) {
  const byId = new Map();
  for (const batch of chunk(videoIds, 50)) {
    const data = await apiGet('videos', {
      part: 'status,contentDetails,snippet',
      id: batch.join(','),
      maxResults: '50',
    });
    for (const v of data.items || []) byId.set(v.id, v);
  }
  return byId;
}

async function main() {
  const now = new Date().toISOString();
  /** @type {import('./video-schema.mjs').ExerciseVideo[]} */
  const catalog = [];
  const perChannel = {};
  const dropped = {}; // reason -> count
  const droppedSamples = {}; // reason -> [videoId,...]

  const drop = (reason, videoId) => {
    dropped[reason] = (dropped[reason] || 0) + 1;
    (droppedSamples[reason] ||= []);
    if (droppedSamples[reason].length < 3) droppedSamples[reason].push(videoId);
  };

  for (const src of SOURCES) {
    perChannel[src.creatorName] = { kept: 0, seen: 0 };
    console.log(`\n[ingest] ${src.creatorName} (${src.source}) — uploads playlist ${src.uploadsPlaylistId}`);

    const ids = await listAllPlaylistVideoIds(src.uploadsPlaylistId);
    perChannel[src.creatorName].seen = ids.length;
    console.log(`  playlist items: ${ids.length}`);

    const details = await fetchVideoDetails(ids);

    for (const vid of ids) {
      const v = details.get(vid);
      if (!v) {
        // In the playlist but not returned by videos.list => usually deleted/private.
        drop('unavailable_in_videos.list', vid);
        continue;
      }
      const status = v.status || {};
      const contentDetails = v.contentDetails || {};
      const snippet = v.snippet || {};

      // privacyStatus must be public (drops unlisted/private/members-only).
      if (status.privacyStatus !== 'public') {
        drop(`privacy_${status.privacyStatus || 'unknown'}`, vid);
        continue;
      }
      // embeddable must be true (the #1 cause of blank embeds).
      if (status.embeddable !== true) {
        drop('not_embeddable', vid);
        continue;
      }
      const durationSec = iso8601DurationToSec(contentDetails.duration);
      if (!Number.isFinite(durationSec)) {
        drop('unparseable_duration', vid);
        continue;
      }
      // Drop Shorts (<30s) — except owned content.
      if (durationSec < MIN_DURATION_SEC && src.source !== 'owned') {
        drop('too_short_shorts_<30s', vid);
        continue;
      }

      catalog.push({
        provider: 'youtube',
        videoId: vid,
        channelId: src.channelId,
        source: src.source,
        attribution: buildAttribution(src, snippet, vid),
        durationSec,
        embeddable: true,
        privacyStatus: status.privacyStatus,
        lastVerifiedAt: now,
      });
      perChannel[src.creatorName].kept += 1;
    }
  }

  // Enforce the schema + the third_party_embed => attribution invariant BEFORE
  // writing. If anything is off, we throw and write nothing.
  assertCatalog(catalog);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

  // ---------- Summary ----------
  console.log('\n===== INGEST SUMMARY =====');
  console.log(`written: ${catalog.length} records -> ${path.relative(process.cwd(), OUT_PATH)}`);

  console.log('\nper channel (kept / seen):');
  for (const [name, c] of Object.entries(perChannel)) {
    console.log(`  ${name.padEnd(24)} ${c.kept} / ${c.seen}`);
  }

  const totalDropped = Object.values(dropped).reduce((a, b) => a + b, 0);
  console.log(`\ndropped: ${totalDropped}`);
  for (const [reason, n] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) {
    const eg = (droppedSamples[reason] || []).join(', ');
    console.log(`  ${reason.padEnd(28)} ${String(n).padStart(4)}   e.g. ${eg}`);
  }

  console.log('\nsample records (up to 5):');
  console.log(JSON.stringify(catalog.slice(0, 5), null, 2));
  console.log('\n[ingest] done.');
}

main().catch((err) => {
  console.error(`\n[ingest] FAILED — no catalog written. ${err.name}: ${err.message}`);
  process.exit(1);
});
