#!/usr/bin/env node
// TUGAS 3 — Seed the pre-verified reference videos into the master library.
//
//   node scripts/seed-videos.mjs
//
// Video IDs are ONLY the ones supplied/verified by the team (Aturan Keras #3) —
// none invented. All are third_party_embed, embeddable:false + verifiedByCoach:false
// (a coach must confirm the embed in the CMS before anything shows to a user).
// creatorName is filled where known; the "(cek via oEmbed)" ones stay '' until
// TUGAS 4 enrichment. attribution is a non-null object (invariant holds); the
// display gate isPublishable() keeps unfinished records off the user UI.
//
// "Plank to Push-Up" is intentionally left video:null (fallback test). Every other
// movement without a video stays null — a normal state, not an error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLibrary } from './exercise-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'data', 'exercise-library.json');
const BACKUPS = path.join(ROOT, 'data', 'video-backups.json');

const watch = (id) => `https://www.youtube.com/watch?v=${id}`;

// slug -> { videoId, creatorName }  (creatorName '' => resolve via oEmbed in TUGAS 4)
const SEED = {
  'kettlebell-swing':           { videoId: 'sSESeQAir2M', creatorName: 'Well+Good' },
  'box-step-up':                { videoId: 'vs87hPGdnCc', creatorName: 'Fit Father Project' },
  'battle-rope-slam':           { videoId: 'zJVbXefebRI', creatorName: '' },
  'farmer-carry':               { videoId: 'lLAw6fUccKA', creatorName: 'Runna' },
  'jump-squat':                 { videoId: 'tZSYZdtbONc', creatorName: 'NASM' },
  'kettlebell-clean-and-press': { videoId: 'lbuIHb_C4FU', creatorName: 'Myprotein' },
  'devil-press':                { videoId: 'cBGQrgovLFM', creatorName: '' },
  'bear-crawl':                 { videoId: 't8XLor7unqU', creatorName: 'Livestrong Woman' },
  'sandbag-squat-clean':        { videoId: '2u6HWUEMu7Y', creatorName: '' },
};

// Backup video IDs (used by TUGAS 4/8 only if the primary fails to embed).
const BACKUP = {
  'kettlebell-swing': 'PO343opm22o',
  'box-step-up': 'WCFCdxzFBa4',
  'battle-rope-slam': '7wDx6mZDxA8',
  'farmer-carry': 'z7E_YU9P1jU',
  'jump-squat': 'A-cFYWvaHr0',
  'kettlebell-clean-and-press': 'fGKMchSmj7c',
  'devil-press': 'RkQqP4tP4lc',
  'sandbag-squat-clean': 'BK0RzmPN8t8',
};

const now = new Date().toISOString();
const library = JSON.parse(fs.readFileSync(LIB, 'utf8'));
const bySlug = new Map(library.map((e) => [e.id, e]));

const missing = Object.keys(SEED).filter((s) => !bySlug.has(s));
if (missing.length) {
  console.error(`[seed] FATAL: these slugs are not in the library: ${missing.join(', ')}`);
  process.exit(1);
}

let seeded = 0;
let pendingCreator = 0;
for (const [slug, { videoId, creatorName }] of Object.entries(SEED)) {
  const ex = bySlug.get(slug);
  ex.video = {
    provider: 'youtube',
    videoId,
    source: 'third_party_embed',
    attribution: {
      creatorName,               // '' when it must be resolved via oEmbed (TUGAS 4)
      channelUrl: '',            // filled by oEmbed
      videoUrl: watch(videoId),  // always known
      videoTitle: '',            // filled by oEmbed
    },
    embeddable: false,           // must be verified in the CMS preview first
    verifiedByCoach: false,
    lastVerifiedAt: now,
  };
  seeded += 1;
  if (!creatorName) pendingCreator += 1;
}

// Enforce schema + the third_party ⇒ attribution invariant before writing.
assertLibrary(library);

fs.writeFileSync(LIB, `${JSON.stringify(library, null, 2)}\n`);
fs.writeFileSync(BACKUPS, `${JSON.stringify(BACKUP, null, 2)}\n`);

const withVideo = library.filter((e) => e.video).length;
console.log('===== TUGAS 3 — SEED SUMMARY =====');
console.log(`seeded videos: ${seeded}  (all third_party_embed, embeddable:false, verifiedByCoach:false)`);
console.log(`  creatorName pending oEmbed (TUGAS 4): ${pendingCreator}  -> battle-rope-slam, devil-press, sandbag-squat-clean`);
console.log(`library: ${library.length} exercises, ${withVideo} with a video, ${library.length - withVideo} still video:null`);
console.log('plank-to-push-up left null (fallback test):', bySlug.get('plank-to-push-up')?.video === null);
console.log(`backups written -> ${path.relative(process.cwd(), BACKUPS)}`);
console.log('\n[seed] done. Nothing is user-visible yet: embeddable:false + verifiedByCoach:false → isPublishable=false.');
