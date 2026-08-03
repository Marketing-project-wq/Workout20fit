#!/usr/bin/env node
// TUGAS 2 — Build the master exercise library from the existing bundle.
//
//   node scripts/migrate-exercises.mjs
//
// Reads the bundled app (Workout 20FIT (1).html), extracts every movement across
// all programs (warmup + main + cooldown), dedups by slug, and writes
// data/exercise-library.json — one record per unique movement with video:null.
// Per-program coaching text is NOT touched (the approved non-lossy approach);
// programs resolve their shared video from this library by slug at render time.
//
// Also prints the migration report: total slots vs unique, top-30 by usage,
// suspicious near-duplicates (for manual review — never auto-merged), and a
// detail-divergence audit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, assertLibrary } from './exercise-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'Workout 20FIT (1).html');
const OUT = path.join(ROOT, 'data', 'exercise-library.json');

// --- extract the x-dc component source, then pull balanced literals from it ---
function loadXdc() {
  const html = fs.readFileSync(HTML, 'utf8');
  const tpl = JSON.parse(/<script type="__bundler\/template">([\s\S]*?)<\/script>/.exec(html)[1]);
  return /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(tpl)[1];
}

function litAfter(src, name) {
  const i = src.indexOf(`${name}=`);
  if (i < 0) throw new Error(`literal not found: ${name}`);
  const start = src.indexOf(src[i + name.length + 1] === '{' ? '{' : '[', i);
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced literal: ${name}`);
}

const x = loadXdc();
// eslint-disable-next-line no-eval
const evalLit = (name) => eval(`(${litAfter(x, name)})`);
const programsSrc = evalLit('_programsSrc');
const wpSrc = evalLit('_wpSrc');
const warmupRaw = evalLit('_warmupRaw');
const cooldownRaw = evalLit('_cooldownRaw');
const prepFamily = (j) => (j === 'yoga' || j === 'pilates') ? 'mindful' : 'dynamic';

const jenisLabel = { hyrox: 'HYROX', functional: 'Functional', yoga: 'Yoga', pilates: 'Pilates', hiit: 'HIIT', strength: 'Strength' };
const nm = (v) => (Array.isArray(v) ? v[0] : v);
const norm = (s) => nm(s).toLowerCase().trim().replace(/\s+/g, ' ');

// --- walk every program's slots ---
const lib = new Map(); // slug -> {id,name,equipment, count, sections:Set, cats:Set, programs:Set}
let warmSlots = 0;
let mainSlots = 0;
let coolSlots = 0;

function touch(rawName, jenis, section, equip, programId) {
  const name = nm(rawName);
  const id = slugify(name);
  if (!lib.has(id)) lib.set(id, { id, name, equipment: '', count: 0, sections: new Set(), cats: new Set(), programs: new Set() });
  const e = lib.get(id);
  e.count += 1;
  e.sections.add(section);
  e.cats.add(jenisLabel[jenis] || jenis);
  e.programs.add(programId);
  if (equip && !e.equipment) e.equipment = nm(equip);
}

for (const p of programsSrc) {
  const fam = prepFamily(p.jenis);
  for (const w of warmupRaw[fam] || []) { touch(w.name, p.jenis, 'warmup', null, p.id); warmSlots++; }
  for (const w of wpSrc[p.id] || []) { touch(w.name, p.jenis, 'main', w.equipment, p.id); mainSlots++; }
  for (const w of cooldownRaw[fam] || []) { touch(w.name, p.jenis, 'cooldown', null, p.id); coolSlots++; }
}

const totalSlots = warmSlots + mainSlots + coolSlots;
const records = [...lib.values()];

// --- write the master library (video:null everywhere; TUGAS 3 seeds them) ---
const library = records
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((e) => ({ id: e.id, name: e.name, equipment: e.equipment || 'Tanpa alat', video: null }));
assertLibrary(library);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(library, null, 2)}\n`);

// ----------------------------- report -----------------------------
const mainRecords = records.filter((e) => e.sections.has('main'));
console.log('===== TUGAS 2 — MIGRATION / DEDUP REPORT =====\n');
console.log(`programs: ${programsSrc.length}`);
console.log(`total exercise slots (all sections): ${totalSlots}  (warmup ${warmSlots}, main ${mainSlots}, cooldown ${coolSlots})`);
console.log(`unique exercises (deduped by slug): ${records.length}   -> ${path.relative(process.cwd(), OUT)} (video:null)`);
console.log(`  unique that appear in MAIN: ${mainRecords.length}`);
console.log(`dedup ratio: ${(totalSlots / records.length).toFixed(1)}x\n`);

const line = (e, i) => {
  const cats = [...e.cats].sort().join(', ');
  const sec = [...e.sections].join('+');
  return `${String(i + 1).padStart(2)}. ${String(e.count).padStart(3)}x [${sec.padEnd(15)}] ${e.name.padEnd(32)} ${cats}`;
};
console.log('----- top 30 (all sections) -----');
records.slice().sort((a, b) => b.count - a.count).slice(0, 30).forEach((e, i) => console.log(line(e, i)));
console.log('\n----- top 30 MAIN only (shooting priority) -----');
mainRecords.slice().sort((a, b) => b.count - a.count).slice(0, 30).forEach((e, i) => console.log(line(e, i)));

// suspicious near-duplicates (report only)
function lev(a, b) {
  const m = a.length; const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
const canon = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ids = records.map((e) => e.id);
const suspicious = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = records[i].name; const b = records[j].name;
  const ca = canon(a); const cb = canon(b);
  if (ca === cb || (Math.abs(ca.length - cb.length) <= 2 && lev(ca, cb) <= 2 && Math.min(ca.length, cb.length) >= 5)) {
    suspicious.push(`  • "${a}"  ~  "${b}"  [${ca === cb ? 'punct/space only' : 'edit<=2'}]`);
  }
}
console.log('\n----- suspicious near-duplicates (manual review — NOT auto-merged) -----');
console.log(suspicious.length ? suspicious.join('\n') : '  (none)');

// detail divergence audit (main only)
const bySlug = new Map();
for (const p of programsSrc) for (const w of wpSrc[p.id] || []) {
  const id = slugify(nm(w.name));
  if (!bySlug.has(id)) bySlug.set(id, []);
  bySlug.get(id).push(w);
}
const fp = (w) => JSON.stringify({
  equip: nm(w.equipment) || '',
  steps: (w.howTo?.steps || []).map(nm),
  mistakes: (w.howTo?.mistakes || []).map(nm),
});
let divergent = 0;
let cleanMulti = 0;
for (const arr of bySlug.values()) {
  if (arr.length < 2) continue;
  if (new Set(arr.map(fp)).size > 1) divergent++; else cleanMulti++;
}
console.log('\n----- detail divergence (main exercises in >1 program) -----');
console.log(`  identical across appearances (safe): ${cleanMulti}`);
console.log(`  DIVERGENT text (kept per-program; master shares only the VIDEO): ${divergent}`);

// sanity: do the 9 TUGAS-3 target slugs exist?
const targets = ['kettlebell-swing', 'box-step-up', 'battle-rope-slam', 'farmer-carry', 'jump-squat', 'kettlebell-clean-and-press', 'devil-press', 'bear-crawl', 'sandbag-squat-clean', 'plank-to-push-up'];
const present = new Set(library.map((e) => e.id));
console.log('\n----- TUGAS-3 target slugs present in library? -----');
for (const t of targets) console.log(`  ${present.has(t) ? '✓' : '✗ MISSING'}  ${t}`);

console.log('\n[migrate] done.');
