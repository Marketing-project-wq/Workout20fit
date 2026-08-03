#!/usr/bin/env node
// Sync the master library's VIDEO entries into the bundle.
//
//   node scripts/sync-library.mjs
//
// data/exercise-library.json is the single source of truth. The static bundle
// carries an inlined `_exVideoLibSrc={ slug: video }` default (only movements
// that have a video) so the app resolves a movement's shared video by slug at
// render time. Run this after any script changes the library (seed / enrich /
// revalidate) so the bundle default stays in step. Idempotent.
//
// Targeted raw replacement (does NOT re-encode the whole template) to keep the
// diff minimal and avoid disturbing the rest of the 900 KB bundle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExerciseVideo } from './exercise-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'Workout 20FIT (1).html');
const LIB = path.join(ROOT, 'data', 'exercise-library.json');

const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
const vmap = {};
for (const e of lib) {
  if (!e.video) continue;
  assertExerciseVideo(e.video); // never inline an invalid record
  vmap[e.id] = e.video;
}

// Build the literal exactly as it must appear INSIDE the JSON-encoded template
// string: compact JSON, quotes escaped, and </ neutralised so it can never
// prematurely close the <script> tag.
const escaped = JSON.stringify(vmap)
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/<\//g, '<\\u002F');

const raw = fs.readFileSync(HTML, 'utf8');
const marker = '_exVideoLibSrc=';
const at = raw.indexOf(marker);
if (at < 0) {
  console.error('[sync] FATAL: _exVideoLibSrc= not found in the bundle.');
  process.exit(1);
}
// brace-match the existing literal on the raw bytes (braces are unescaped).
const open = raw.indexOf('{', at);
let depth = 0;
let end = -1;
for (let i = open; i < raw.length; i++) {
  if (raw[i] === '{') depth++;
  else if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) { console.error('[sync] FATAL: could not brace-match _exVideoLibSrc literal.'); process.exit(1); }

const next = raw.slice(0, open) + escaped + raw.slice(end);
if (next === raw) {
  console.log(`[sync] already in sync (${Object.keys(vmap).length} videos). No change.`);
} else {
  fs.writeFileSync(HTML, next);
  console.log(`[sync] updated bundle _exVideoLibSrc with ${Object.keys(vmap).length} video(s): ${Object.keys(vmap).join(', ')}`);
}
