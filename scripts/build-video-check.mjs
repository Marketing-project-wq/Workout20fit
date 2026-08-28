#!/usr/bin/env node
// Build tools/video-check.html — a self-contained page that tests every video
// in the catalogue from a browser.
//
//   node scripts/build-video-check.mjs      # or: npm run build:video-check
//
// Why a browser page and not a Node script: check-catalog-videos.mjs can only
// ask oEmbed whether a video exists. It cannot tell whether the video is
// allowed to play inside an iframe, which is the thing that actually breaks the
// app — a video with embedding disabled looks perfectly healthy to oEmbed and
// then shows "Video unavailable" to the user. Only a real embed can answer
// that, so the check has to run where one can be created.
//
// The generated page inlines every session and episode video id, so it works
// from file:// with no server and no build step. It runs two passes:
//
//   1. oEmbed over JSONP — catches deleted, private and non-existent videos.
//   2. A real YouTube player — catches embedding disabled (error 101/150) and
//      playback errors on everything that survived pass 1.
//
// Re-run this generator whenever the seeded catalogue changes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'Workout 20FIT (1).html');
const OUT = path.join(ROOT, 'tools', 'video-check.html');

// ---------------------------------------------------------------- extraction

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
  const body = balanced(src, src.indexOf(open, i), open, close);
  // eslint-disable-next-line no-eval
  return eval(open === '{' ? `(${body})` : body);
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
  const series = literal(vm.slice(vm.indexOf('seedSeries(){')), 'rows:[', '[', ']');

  const slots = [];
  for (const p of named) slots.push({ kind: 'sesi', ref: p.id, label: p.name, cat: p.jenis, dur: p.duration || '', url: videoMap[p.id] || '' });
  for (const p of generated) slots.push({ kind: 'sesi', ref: p.id, label: p.name, cat: p.jenis, dur: p.duration || '', url: p.video || '' });
  for (const prog of series) {
    (prog.episodes || []).forEach((e, i) => {
      slots.push({
        kind: 'episode',
        ref: `${prog.id}/${e.id}`,
        label: `${prog.title.id} — Ep${i + 1}`,
        cat: `col${prog.colId}`,
        dur: e.duration || '',
        url: e.video || '',
      });
    });
  }
  return slots.map((s) => ({ kind: s.kind, ref: s.ref, label: s.label, cat: s.cat, dur: s.dur, id: videoId(s.url) }));
}

// ------------------------------------------------------------------ the page

const page = (slots) => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>20FIT — Cek Video Katalog</title>
<style>
  :root{ --red:#C41101; --text:#0A0908; --soft:#36322D; --faint:#9E8E7A;
         --bg:#EDE8DF; --card:#FFFFFF; --line:#DDD5C8; --ok:#12805C; --bad:#C41101; --warn:#B26A00; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
        font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif; font-size:14px; }
  .wrap{ max-width:1000px; margin:0 auto; }
  h1{ font-size:22px; margin:0 0 4px; }
  p.sub{ margin:0 0 20px; color:var(--soft); line-height:1.55; }
  .panel{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px 20px; margin-bottom:18px; }
  button{ font:inherit; font-weight:700; padding:11px 20px; border-radius:999px; border:none; cursor:pointer;
          background:var(--red); color:#fff; }
  button.ghost{ background:transparent; border:1px solid var(--line); color:var(--text); }
  button:disabled{ opacity:.45; cursor:default; }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .bar{ height:8px; background:var(--line); border-radius:999px; overflow:hidden; margin:14px 0 8px; }
  .bar > i{ display:block; height:100%; width:0; background:var(--red); transition:width .2s ease; }
  .counts{ display:flex; gap:18px; flex-wrap:wrap; font-variant-numeric:tabular-nums; color:var(--soft); }
  .counts b{ color:var(--text); }
  table{ width:100%; border-collapse:collapse; }
  th,td{ text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); }
  td.id{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  .tag{ display:inline-block; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; }
  .t-ok{ background:rgba(18,128,92,.12); color:var(--ok); }
  .t-bad{ background:rgba(196,17,1,.12); color:var(--bad); }
  .t-warn{ background:rgba(178,106,0,.14); color:var(--warn); }
  .t-idle{ background:rgba(158,142,122,.16); color:var(--faint); }
  .hide{ display:none; }
  #stage{ position:fixed; left:-9999px; top:0; width:320px; height:180px; }
  .note{ font-size:12.5px; color:var(--soft); line-height:1.6; }
  a{ color:var(--red); }
</style>
</head>
<body>
<div class="wrap">
  <h1>Cek Video Katalog 20FIT</h1>
  <p class="sub">
    ${slots.length} video &mdash; ${slots.filter((s) => s.kind === 'sesi').length} sesi latihan dan
    ${slots.filter((s) => s.kind === 'episode').length} episode program.
    Halaman ini harus dijalankan dari browser yang bisa akses YouTube.
  </p>

  <div class="panel">
    <div class="row">
      <button id="run">Mulai cek</button>
      <button id="stop" class="ghost" disabled>Berhenti</button>
      <button id="copy" class="ghost" disabled>Salin yang error</button>
      <button id="dl" class="ghost" disabled>Unduh JSON</button>
      <label class="row" style="gap:6px; margin-left:auto; color:var(--soft);">
        <input type="checkbox" id="onlyBad"> tampilkan yang bermasalah saja
      </label>
    </div>
    <div class="bar"><i id="progress"></i></div>
    <div class="counts">
      <span>diperiksa <b id="c-done">0</b>/<b>${slots.length}</b></span>
      <span>aman <b id="c-ok">0</b></span>
      <span>error <b id="c-bad">0</b></span>
      <span>ragu <b id="c-warn">0</b></span>
      <span id="phase"></span>
    </div>
  </div>

  <div class="panel">
    <p class="note">
      <b>Dua tahap.</b> Tahap 1 nanya oEmbed apakah videonya masih ada &mdash; ketahuan yang dihapus,
      diprivat, atau ID-nya salah. Tahap 2 benar-benar memuat pemutar YouTube untuk tiap video yang lolos,
      supaya ketahuan yang <i>embed-nya dimatikan pemiliknya</i> (error 101/150). Yang kedua ini gak bisa
      dideteksi oEmbed, padahal justru itu yang bikin video kelihatan &ldquo;Video unavailable&rdquo; di app.
      Tahap 2 memuat video beneran, jadi butuh beberapa menit &mdash; sekalian dia baca
      judul, kanal, dan <b>durasi asli</b> tiap video, biar ketahuan juga slot yang labelnya
      10 menit tapi videonya 31 menit, atau judulnya gak nyambung sama nama sesinya.
    </p>
  </div>

  <div class="panel">
    <table>
      <thead><tr><th>#</th><th>Jenis</th><th>Slot di 20FIT</th><th>Video YouTube</th><th>Durasi</th><th>Status</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>

<div id="stage"></div>

<script>
var SLOTS = ${JSON.stringify(slots)};
var PARALLEL = 6;
var PLAYER_TIMEOUT_MS = 8000;

var rowsEl = document.getElementById('rows');
var els = [];
var state = SLOTS.map(function(){ return { status:'idle', detail:'', title:'', author:'', secs:null }; });
var stopped = false;

// "20min" -> [20,20]; "20-40 menit" -> [20,40]; anything unparseable -> null
function labelRange(txt){
  var m = String(txt||'').match(/[0-9]+/g);
  if (!m || !m.length) return null;
  var a = parseInt(m[0],10), b = m.length>1 ? parseInt(m[1],10) : a;
  return [Math.min(a,b), Math.max(a,b)];
}
function durVerdict(labelTxt, secs){
  if (secs==null) return { text:(labelTxt||'—'), bad:false };
  var mins = Math.round(secs/60);
  var r = labelRange(labelTxt);
  var shown = (labelTxt||'—') + ' → ' + mins + ' menit';
  if (!r) return { text:shown, bad:false };
  var bad = mins < Math.round(r[0]*0.6) || mins > Math.round(r[1]*1.5);
  return { text:shown, bad:bad, mins:mins };
}

function tag(status, detail){
  if (status === 'ok')   return '<span class="tag t-ok">AMAN</span>';
  if (status === 'bad')  return '<span class="tag t-bad">' + detail + '</span>';
  if (status === 'warn') return '<span class="tag t-warn">' + detail + '</span>';
  if (status === 'busy') return '<span class="tag t-idle">memeriksa…</span>';
  return '<span class="tag t-idle">belum</span>';
}

SLOTS.forEach(function(s, i){
  var tr = document.createElement('tr');
  tr.innerHTML = '<td>' + (i+1) + '</td><td>' + s.kind + '</td>' +
    '<td>' + s.label + '<br><span class="id" style="color:var(--faint)">' + (s.id || 'ID KOSONG') + '</span></td>' +
    '<td class="yt"></td><td class="dur"></td><td class="st"></td>';
  rowsEl.appendChild(tr);
  els.push(tr);
});

function paint(i){
  var st = state[i], s = SLOTS[i];
  els[i].children[3].innerHTML = st.title
    ? (st.title + '<br><span style="color:var(--faint); font-size:12px;">' + st.author + '</span>')
    : '';
  var dv = durVerdict(s.dur, st.secs);
  els[i].children[4].innerHTML = dv.bad
    ? '<span class="tag t-warn">' + dv.text + '</span>'
    : '<span style="color:var(--soft)">' + dv.text + '</span>';
  els[i].children[5].innerHTML = tag(st.status, st.detail);
  var flagged = st.status === 'bad' || st.status === 'warn' || dv.bad;
  els[i].className = (document.getElementById('onlyBad').checked && !flagged) ? 'hide' : '';
}
function repaint(){ for (var i=0;i<state.length;i++) paint(i); }
document.getElementById('onlyBad').addEventListener('change', repaint);

function counts(){
  var ok=0, bad=0, warn=0, done=0;
  state.forEach(function(s){
    if (s.status==='ok'){ ok++; done++; }
    else if (s.status==='bad'){ bad++; done++; }
    else if (s.status==='warn'){ warn++; done++; }
  });
  document.getElementById('c-ok').textContent = ok;
  document.getElementById('c-bad').textContent = bad;
  document.getElementById('c-warn').textContent = warn;
  document.getElementById('c-done').textContent = done;
  document.getElementById('progress').style.width = (done / SLOTS.length * 100) + '%';
  document.getElementById('copy').disabled = document.getElementById('dl').disabled = (done === 0);
}

// ---- pass 1: oEmbed over JSONP (works cross-origin, no CORS needed)
function oembed(id){
  return new Promise(function(resolve){
    var cb = 'ytcb_' + Math.random().toString(36).slice(2);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function(){ finish({ ok:false, reason:'TIMEOUT' }); }, 12000);
    function finish(r){
      if (done) return; done = true;
      clearTimeout(timer);
      try { delete window[cb]; } catch(e) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve(r);
    }
    window[cb] = function(data){ finish({ ok:true, title:(data && data.title) || '', author:(data && data.author_name) || '' }); };
    // A missing/private video makes YouTube answer with an error status and no
    // JSONP body, so the script simply fails to load — that is the signal.
    s.onerror = function(){ finish({ ok:false, reason:'HILANG / PRIVAT' }); };
    s.src = 'https://www.youtube.com/oembed?format=json&callback=' + cb +
            '&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
    document.body.appendChild(s);
  });
}

// ---- pass 2: a real player, which is the only thing that knows about embedding
var apiReady = new Promise(function(resolve){
  window.onYouTubeIframeAPIReady = resolve;
  var s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.body.appendChild(s);
});

function makePlayer(slotIndex){
  return new Promise(function(resolve){
    var host = document.createElement('div');
    document.getElementById('stage').appendChild(host);
    var p = new YT.Player(host, {
      height:180, width:320, videoId:'',
      playerVars:{ rel:0, modestbranding:1 },
      events:{ onReady: function(){ resolve({ player:p, host:host }); } }
    });
  });
}

function testEmbed(slot, p){
  return new Promise(function(resolve){
    var done = false;
    var timer = setTimeout(function(){ finish({ status:'warn', detail:'TIDAK MERESPONS' }); }, PLAYER_TIMEOUT_MS);
    function finish(r){
      if (done) return; done = true;
      clearTimeout(timer);
      p.player.removeEventListener('onError', onErr);
      p.player.removeEventListener('onStateChange', onState);
      resolve(r);
    }
    function onErr(e){
      var code = e && e.data;
      if (code === 101 || code === 150) finish({ status:'bad', detail:'EMBED DIMATIKAN' });
      else if (code === 100) finish({ status:'bad', detail:'DIHAPUS / PRIVAT' });
      else if (code === 2)   finish({ status:'bad', detail:'ID TIDAK VALID' });
      else if (code === 5)   finish({ status:'warn', detail:'ERROR PEMUTAR (5)' });
      else finish({ status:'warn', detail:'ERROR ' + code });
    }
    function onState(){
      var secs = null;
      try { secs = p.player.getDuration(); } catch(e) {}
      finish({ status:'ok', detail:'', secs:(secs>0?secs:null) });
    }
    p.player.addEventListener('onError', onErr);
    p.player.addEventListener('onStateChange', onState);
    try { p.player.cueVideoById(slot.id); } catch (err) { finish({ status:'warn', detail:'GAGAL MEMUAT' }); }
  });
}

async function runPool(items, n, worker){
  var next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async function(_, lane){
    while (next < items.length && !stopped) {
      var i = next++;
      await worker(items[i], lane);
    }
  }));
}

// A blocked network fails every JSONP load exactly like a deleted video does,
// which would report the whole catalogue as dead. Prove YouTube answers at all
// before believing any verdict.
var CONTROL_ID = 'BgCbQJJddBY';

async function run(){
  stopped = false;
  document.getElementById('run').disabled = true;
  document.getElementById('stop').disabled = false;

  document.getElementById('phase').textContent = '· cek koneksi ke YouTube';
  var control = await oembed(CONTROL_ID);
  if (!control.ok) {
    document.getElementById('phase').textContent = '';
    alert('Browser ini tidak bisa menghubungi YouTube (tidak ada respons).\\n\\n' +
          'Semua video akan terlihat rusak padahal belum tentu. Buka halaman ini di jaringan ' +
          'yang bisa akses YouTube, lalu jalankan lagi.');
    document.getElementById('run').disabled = false;
    document.getElementById('stop').disabled = true;
    return;
  }

  SLOTS.forEach(function(s, i){
    if (!s.id) { state[i] = { status:'bad', detail:'ID KOSONG' }; paint(i); }
  });
  counts();

  var todo = SLOTS.map(function(s, i){ return { s:s, i:i }; }).filter(function(x){ return !!x.s.id; });

  // pass 1
  document.getElementById('phase').textContent = '· tahap 1: cek keberadaan';
  var survivors = [];
  await runPool(todo, 8, async function(x){
    state[x.i] = { status:'busy', detail:'' }; paint(x.i);
    var r = await oembed(x.s.id);
    if (r.ok) { survivors.push(x); state[x.i] = { status:'busy', detail:'', title:r.title, author:r.author, secs:null }; }
    else { state[x.i] = { status:'bad', detail:r.reason, title:'', author:'', secs:null }; }
    paint(x.i); counts();
  });
  if (stopped) return finishRun();

  // pass 2
  document.getElementById('phase').textContent = '· tahap 2: cek embed (butuh beberapa menit)';
  await apiReady;
  var players = [];
  for (var k = 0; k < PARALLEL; k++) players.push(await makePlayer(k));
  await runPool(survivors, PARALLEL, async function(x, lane){
    var r = await testEmbed(x.s, players[lane]);
    state[x.i] = { status:r.status, detail:r.detail||'', title:state[x.i].title, author:state[x.i].author, secs:(r.secs!=null?r.secs:null) };
    paint(x.i); counts();
  });
  players.forEach(function(p){ try { p.player.destroy(); } catch(e){} });
  finishRun();
}

function finishRun(){
  document.getElementById('phase').textContent = stopped ? '· dihentikan' : '· selesai';
  document.getElementById('run').disabled = false;
  document.getElementById('stop').disabled = true;
  counts();
}

function failures(){
  return SLOTS.map(function(s, i){
    var st = state[i], dv = durVerdict(s.dur, st.secs);
    return { kind:s.kind, ref:s.ref, label:s.label, cat:s.cat, id:s.id,
             status:st.status, detail:st.detail,
             ytTitle:st.title, ytChannel:st.author,
             durLabel:s.dur, durActualMin:(st.secs!=null?Math.round(st.secs/60):null),
             durMismatch:!!dv.bad };
  }).filter(function(r){ return r.status === 'bad' || r.status === 'warn' || r.durMismatch; });
}

document.getElementById('run').addEventListener('click', run);
document.getElementById('stop').addEventListener('click', function(){ stopped = true; });
document.getElementById('copy').addEventListener('click', function(){
  var text = failures().map(function(r){
    var why = (r.status === 'ok') ? 'DURASI MELESET' : (r.detail || r.status.toUpperCase());
    return why + '\\t' + r.kind + '\\t' + r.ref + '\\t' + r.id + '\\t' + r.label +
           '\\t' + (r.durLabel || '') + (r.durActualMin != null ? (' -> ' + r.durActualMin + ' menit') : '') +
           '\\t' + (r.ytTitle || '');
  }).join('\\n');
  navigator.clipboard.writeText(text || 'tidak ada yang bermasalah').then(function(){
    var b = document.getElementById('copy'); var old = b.textContent;
    b.textContent = 'tersalin!'; setTimeout(function(){ b.textContent = old; }, 1400);
  });
});
document.getElementById('dl').addEventListener('click', function(){
  var report = { checkedAt:new Date().toISOString(), total:SLOTS.length, failures:failures() };
  var blob = new Blob([JSON.stringify(report, null, 2)], { type:'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'video-check.json';
  a.click();
});

repaint(); counts();
</script>
</body>
</html>
`;

const slots = collect();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page(slots));
console.log(`${slots.length} video (${slots.filter((s) => s.kind === 'sesi').length} sesi, ${slots.filter((s) => s.kind === 'episode').length} episode)`);
console.log(`ditulis: ${path.relative(ROOT, OUT)}`);
