#!/usr/bin/env node
// Check every session and program-episode video in the bundle.
//
//   node scripts/check-catalog-videos.mjs            # full report
//   node scripts/check-catalog-videos.mjs --broken   # only what needs fixing
//
// Reads the ids straight out of `Workout 20FIT (1).html` — the 176 session
// videos (_programsSrc + _seedVideoMap, plus _extraPrograms) and the 160
// episode videos (seedSeries) — and probes each one through the public YouTube
// oEmbed endpoint. Writes logs/catalog-videos.json and prints a summary.
//
// Offline checks run first and always: a missing video, a malformed id, and the
// same id used in two places. Those need no network.
//
// HARD LIMIT, same as enrich-videos.mjs: oEmbed does NOT report embeddability.
// A video whose embed is disabled still returns a valid oEmbed, so a PASS here
// means "the video exists and is public", never "it plays inside the app".
// Embeddability stays a manual check in the CMS preview.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'Workout 20FIT (1).html');
const LOGS = path.join(ROOT, 'logs');
const TIMEOUT_MS = 15000;
const CONCURRENCY = 6;

const brokenOnly = process.argv.includes('--broken');

// ---------------------------------------------------------------- extraction

// The app ships as one JSON-encoded template with the view-model inside it.
function readViewModel() {
  const html = fs.readFileSync(BUNDLE, 'utf8');
  const tpl = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!tpl) throw new Error('template script not found in the bundle');
  const walk = function* (node) {
    if (Array.isArray(node)) { for (const v of node) yield* walk(v); }
    else if (node && typeof node === 'object') { for (const v of Object.values(node)) yield* walk(v); }
    else if (typeof node === 'string' && node.includes('data-dc-script')) yield node;
  };
  const host = [...walk(JSON.parse(tpl[1]))][0];
  const vm = /<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/.exec(host);
  if (!vm) throw new Error('view-model script not found in the template');
  return vm[1];
}

// Slice a balanced literal, skipping over quoted strings.
function balanced(src, from, open, close) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error('unbalanced literal');
}

const literal = (src, needle, open, close) => {
  const i = src.indexOf(needle);
  if (i < 0) throw new Error(`"${needle}" not found in the view model`);
  const j = src.indexOf(open, i);
  // eslint-disable-next-line no-eval
  return eval(open === '{' ? `(${balanced(src, j, open, close)})` : balanced(src, j, open, close));
};

const videoId = (url) => {
  const m = /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})(?:[?&#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
};

function collect() {
  const vm = readViewModel();
  const named = literal(vm, '_programsSrc=', '[', ']');
  const generated = literal(vm, '_extraPrograms=', '[', ']');
  const videoMap = literal(vm, '_seedVideoMap=', '{', '}');
  const seriesAt = vm.indexOf('seedSeries(){');
  const series = literal(vm.slice(seriesAt), 'rows:[', '[', ']');

  const slots = [];
  for (const p of named) {
    slots.push({ kind: 'sesi', ref: p.id, label: p.name, url: videoMap[p.id] || '' });
  }
  for (const p of generated) {
    slots.push({ kind: 'sesi', ref: p.id, label: p.name, url: p.video || '' });
  }
  for (const prog of series) {
    (prog.episodes || []).forEach((e, i) => {
      slots.push({
        kind: 'episode',
        ref: `${prog.id}/${e.id}`,
        label: `${prog.title.id} — Ep${i + 1}`,
        url: e.video || '',
      });
    });
  }
  return slots.map((s) => ({ ...s, videoId: videoId(s.url) }));
}

// ------------------------------------------------------------------- probing

const oembedUrl = (id) =>
  `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;

async function oembed(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl(id), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
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

// A corporate proxy or a blocked network answers every request the same way, so
// without this the whole catalogue would be reported broken. Probe one video
// that is known to be public first; if even that fails, the network is the
// problem and nothing can be said about the catalogue.
const CONTROL_ID = 'BgCbQJJddBY';

async function reachable() {
  const r = await oembed(CONTROL_ID);
  // The control video is public, so any failure here is the network, not YouTube's
  // verdict on it — report the transport detail, not the per-video reason.
  return r.ok ? { ok: true } : { ok: false, reason: `oEmbed kontrol gagal: ${r.reason}` };
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------------- main

async function main() {
  const slots = collect();
  const sessions = slots.filter((s) => s.kind === 'sesi');
  const episodes = slots.filter((s) => s.kind === 'episode');

  const missing = slots.filter((s) => !s.videoId);
  const seen = new Map();
  for (const s of slots) {
    if (!s.videoId) continue;
    if (!seen.has(s.videoId)) seen.set(s.videoId, []);
    seen.get(s.videoId).push(s);
  }
  const duplicates = [...seen.entries()].filter(([, uses]) => uses.length > 1);

  console.log(`sesi     : ${sessions.length} slot, ${sessions.filter((s) => s.videoId).length} ada video`);
  console.log(`episode  : ${episodes.length} slot, ${episodes.filter((s) => s.videoId).length} ada video`);
  console.log(`video id : ${seen.size} unik dari ${slots.length - missing.length} slot terisi`);
  if (missing.length) {
    console.log(`\nTANPA VIDEO (${missing.length}):`);
    for (const s of missing) console.log(`  ${s.kind} ${s.ref} — ${s.label}`);
  }
  if (duplicates.length) {
    console.log(`\nVIDEO DIPAKAI ULANG (${duplicates.length}):`);
    for (const [id, uses] of duplicates) {
      console.log(`  ${id} → ${uses.map((u) => `${u.kind} ${u.ref}`).join(' | ')}`);
    }
  }

  const net = await reachable();
  if (!net.ok) {
    console.log(`\nYouTube tidak bisa dijangkau dari mesin ini (${net.reason}).`);
    console.log('Cek offline di atas tetap berlaku; status hidup/mati tiap video belum dicek.');
    console.log('Jalankan ulang script ini di jaringan yang bisa akses YouTube.');
    process.exitCode = missing.length || duplicates.length ? 1 : 0;
    return;
  }

  const toProbe = [...seen.keys()];
  console.log(`\nProbing ${toProbe.length} video lewat oEmbed…`);
  const results = await pool(toProbe, async (id) => ({ id, ...(await oembed(id)) }));

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(`\nHIDUP  : ${passed.length}`);
  console.log(`GAGAL  : ${failed.length}`);
  for (const f of failed) {
    for (const use of seen.get(f.id)) console.log(`  ${f.id} — ${f.reason} — ${use.kind} ${use.ref} (${use.label})`);
  }

  if (!brokenOnly) {
    const byChannel = new Map();
    for (const r of passed) byChannel.set(r.authorName, (byChannel.get(r.authorName) || 0) + 1);
    console.log(`\nKANAL (${byChannel.size}):`);
    for (const [name, n] of [...byChannel.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${name}`);
    }
  }

  fs.mkdirSync(LOGS, { recursive: true });
  const report = {
    checkedAt: new Date().toISOString(),
    counts: {
      sessions: sessions.length,
      episodes: episodes.length,
      distinctVideos: seen.size,
      missing: missing.length,
      duplicates: duplicates.length,
      live: passed.length,
      failed: failed.length,
    },
    missing,
    duplicates: duplicates.map(([id, uses]) => ({ id, uses })),
    videos: results.map((r) => ({ ...r, uses: seen.get(r.id).map((u) => ({ kind: u.kind, ref: u.ref, label: u.label })) })),
    note: 'oEmbed cannot report embeddability — a PASS means public and existing, not playable in an iframe.',
  };
  const out = path.join(LOGS, 'catalog-videos.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nLaporan: ${path.relative(ROOT, out)}`);

  if (failed.length || missing.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
