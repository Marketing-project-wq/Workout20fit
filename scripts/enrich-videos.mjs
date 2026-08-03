#!/usr/bin/env node
// TUGAS 4 — Enrich video attribution via YouTube oEmbed (no API key needed).
//
//   node scripts/enrich-videos.mjs
//   # then: npm run sync:library   (push the updated defaults into the bundle)
//
// For every movement in data/exercise-library.json that has a video, call the
// public oEmbed endpoint and fill attribution.creatorName / channelUrl /
// videoTitle from author_name / author_url / title. Videos whose oEmbed errors
// (deleted / private / removed) are collected into a report — not silently
// dropped. If a primary fails, the backup id from data/video-backups.json is
// probed too and surfaced for a human to decide (never auto-swapped).
//
// HARD LIMIT (Aturan Keras): oEmbed does NOT report embeddability. A video whose
// embed is disabled can still return a valid oEmbed. So this script NEVER sets
// embeddable = true — that stays a manual CMS-preview decision (TUGAS 6). It also
// never flips verifiedByCoach.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLibrary } from './exercise-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'data', 'exercise-library.json');
const BACKUPS = path.join(ROOT, 'data', 'video-backups.json');
const LOGS = path.join(ROOT, 'logs');
const TIMEOUT_MS = 15000;

const oembedUrl = (id) =>
  `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;

async function oembed(videoId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl(videoId), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 401) return { ok: false, reason: 'private (401)' };
    if (res.status === 404) return { ok: false, reason: 'not found / deleted (404)' };
    if (res.status === 403) return { ok: false, reason: 'forbidden / embedding restricted (403)' };
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const j = await res.json();
    if (!j || !j.author_name) return { ok: false, reason: 'malformed oEmbed (no author_name)' };
    return { ok: true, title: j.title || '', authorName: j.author_name || '', authorUrl: j.author_url || '' };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : `network: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const now = new Date().toISOString();
  const library = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  const backups = fs.existsSync(BACKUPS) ? JSON.parse(fs.readFileSync(BACKUPS, 'utf8')) : {};
  const withVideo = library.filter((e) => e.video);

  const enriched = [];
  const failed = [];

  for (const ex of withVideo) {
    const v = ex.video;
    const r = await oembed(v.videoId);
    if (r.ok) {
      if (v.source === 'third_party_embed') {
        v.attribution = v.attribution || {};
        v.attribution.creatorName = r.authorName;
        v.attribution.channelUrl = r.authorUrl;
        v.attribution.videoTitle = r.title;
        v.attribution.videoUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
      }
      v.lastVerifiedAt = now;
      enriched.push({ slug: ex.id, videoId: v.videoId, creatorName: r.authorName });
    } else {
      const backupId = backups[ex.id];
      let backupNote = backupId ? { backupId, backup: await oembed(backupId) } : null;
      failed.push({ slug: ex.id, videoId: v.videoId, reason: r.reason, backup: backupNote });
    }
  }

  // Schema still valid (third_party ⇒ attribution non-null) before writing.
  assertLibrary(library);
  fs.writeFileSync(LIB, `${JSON.stringify(library, null, 2)}\n`);

  // report to logs
  fs.mkdirSync(LOGS, { recursive: true });
  const date = now.slice(0, 10);
  const reportPath = path.join(LOGS, `video-enrich-${date}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ ranAt: now, enriched, failed }, null, 2)}\n`);

  console.log('===== TUGAS 4 — ENRICH SUMMARY =====');
  console.log(`videos with a record: ${withVideo.length}`);
  console.log(`enriched OK: ${enriched.length}`);
  enriched.forEach((e) => console.log(`  ✓ ${e.slug.padEnd(28)} ${e.videoId}  →  ${e.creatorName}`));
  console.log(`failed (reported, NOT modified): ${failed.length}`);
  failed.forEach((f) => {
    const b = f.backup ? (f.backup.backup.ok ? `backup ${f.backup.backupId} OK (${f.backup.backup.authorName})` : `backup ${f.backup.backupId} also failed (${f.backup.backup.reason})`) : 'no backup';
    console.log(`  ✗ ${f.slug.padEnd(28)} ${f.videoId}  ${f.reason}  — ${b}`);
  });
  console.log(`\nreport -> ${path.relative(process.cwd(), reportPath)}`);
  console.log('REMINDER: oEmbed cannot confirm embeddability. embeddable / verifiedByCoach were NOT changed — verify each in the CMS.');
  console.log('Next: npm run sync:library  (push updated attribution into the bundle default)');
}

main().catch((err) => {
  console.error(`\n[enrich] FAILED — library not written. ${err.name}: ${err.message}`);
  process.exit(1);
});
