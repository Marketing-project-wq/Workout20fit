#!/usr/bin/env node
// Build tools/exercise-video-check.html — a self-contained page that verifies
// every exercise-library demo video from a browser that can reach YouTube.
//
//   node scripts/build-exercise-video-check.mjs
//
// Why a browser page: exactly like tools/video-check.html for the catalogue,
// oEmbed alone cannot tell whether a video is allowed to play inside an iframe
// (embedding disabled → error 101/150). That is the failure that actually
// breaks playback for a patient following an assigned exercise, and only a real
// embed can detect it. So the check runs where a player can be created.
//
// Two automated passes:
//   1. oEmbed over JSONP — deleted / private / bad-id videos.
//   2. A real YouTube player — embedding disabled (101/150) + playback errors,
//      and it reads back the real title, channel and duration so a reviewer can
//      spot a video whose title does not match the movement.
//
// Plus a manual clinical-review layer: each row links out to the video and the
// reviewer marks it OK / GANTI (replace). Verdicts persist in localStorage and
// export to CSV, so a coach/clinician can sign off that the movement shown is
// correct and safe before it is prescribed.
//
// Data source: data/exercise-video-index.json (id, nama, kat, lvl, url),
// generated from the w20fit_exercises table. Re-run this after the table
// changes. The rows are inlined into the page so it works from file:// with no
// server, no Supabase and no build step.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'exercise-video-index.json');
const OUT = path.join(ROOT, 'tools', 'exercise-video-check.html');

const videoId = (url) => {
  const m = /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})(?:[?&#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
};

const rows = JSON.parse(fs.readFileSync(DATA, 'utf8')).map((r) => ({
  id: r.id, nama: r.nama, kat: r.kat || '', lvl: r.lvl || '', vid: videoId(r.url),
}));

const cats = [...new Set(rows.map((r) => r.kat))].sort();

const page = (slots) => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>20FIT — Cek Video Exercise</title>
<style>
  :root{ --red:#C41101; --text:#0A0908; --soft:#36322D; --faint:#9E8E7A;
         --bg:#EDE8DF; --card:#FFFFFF; --line:#DDD5C8; --ok:#12805C; --bad:#C41101; --warn:#B26A00; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
        font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif; font-size:14px; }
  .wrap{ max-width:1080px; margin:0 auto; }
  h1{ font-size:22px; margin:0 0 4px; }
  p.sub{ margin:0 0 20px; color:var(--soft); line-height:1.55; }
  .panel{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px 20px; margin-bottom:18px; }
  button{ font:inherit; font-weight:700; padding:11px 20px; border-radius:999px; border:none; cursor:pointer;
          background:var(--red); color:#fff; }
  button.ghost{ background:transparent; border:1px solid var(--line); color:var(--text); }
  button.mini{ padding:5px 12px; font-size:12px; }
  button:disabled{ opacity:.45; cursor:default; }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .bar{ height:8px; background:var(--line); border-radius:999px; overflow:hidden; margin:14px 0 8px; }
  .bar > i{ display:block; height:100%; width:0; background:var(--red); transition:width .2s ease; }
  .counts{ display:flex; gap:18px; flex-wrap:wrap; font-variant-numeric:tabular-nums; color:var(--soft); }
  .counts b{ color:var(--text); }
  select{ font:inherit; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:#fff; }
  table{ width:100%; border-collapse:collapse; }
  th,td{ text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--faint); }
  td.id{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  .tag{ display:inline-block; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; }
  .t-ok{ background:rgba(18,128,92,.12); color:var(--ok); }
  .t-bad{ background:rgba(196,17,1,.12); color:var(--bad); }
  .t-warn{ background:rgba(178,106,0,.14); color:var(--warn); }
  .t-idle{ background:rgba(158,142,122,.16); color:var(--faint); }
  .chip{ display:inline-block; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; background:rgba(158,142,122,.16); color:var(--soft); text-transform:uppercase; letter-spacing:.04em; }
  .hide{ display:none; }
  #stage{ position:fixed; left:-9999px; top:0; width:320px; height:180px; }
  .note{ font-size:12.5px; color:var(--soft); line-height:1.6; }
  a{ color:var(--red); }
  .verdict button{ margin-right:6px; }
  .v-ok{ background:var(--ok)!important; color:#fff!important; }
  .v-bad{ background:var(--bad)!important; color:#fff!important; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Cek Video Exercise 20FIT</h1>
  <p class="sub">
    ${slots.length} gerakan di exercise library. Halaman ini <b>harus dibuka di browser yang bisa akses YouTube</b>.
    Cek otomatis nangkep video yang hilang / embed-nya dimatikan; kolom <b>Review</b> buat dokter/coach
    nandain apakah gerakan di videonya <b>benar &amp; aman</b> sebelum diresepkan.
  </p>

  <div class="panel">
    <div class="row">
      <button id="run">Mulai cek otomatis</button>
      <button id="stop" class="ghost" disabled>Berhenti</button>
      <button id="dl" class="ghost">Unduh hasil (JSON)</button>
      <button id="csv" class="ghost">Unduh review (CSV)</button>
      <label class="row" style="gap:6px; color:var(--soft);">Kategori
        <select id="fCat"><option value="">semua</option>${cats.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
      </label>
      <label class="row" style="gap:6px; margin-left:auto; color:var(--soft);">
        <input type="checkbox" id="onlyBad"> masalah / belum di-review saja
      </label>
    </div>
    <div class="bar"><i id="progress"></i></div>
    <div class="counts">
      <span>diperiksa <b id="c-done">0</b>/<b>${slots.length}</b></span>
      <span>embed aman <b id="c-ok">0</b></span>
      <span>embed error <b id="c-bad">0</b></span>
      <span>ragu <b id="c-warn">0</b></span>
      <span>review OK <b id="c-vok">0</b></span>
      <span>tandai ganti <b id="c-vbad">0</b></span>
      <span id="phase"></span>
    </div>
  </div>

  <div class="panel">
    <p class="note">
      <b>Cek otomatis = 2 tahap.</b> Tahap 1 (oEmbed) nangkep video yang dihapus/privat/ID salah.
      Tahap 2 muat pemutar YouTube beneran buat tiap video yang lolos — nangkep <i>embed dimatikan pemilik</i>
      (error 101/150) yang bikin video jadi &ldquo;Video unavailable&rdquo; di app, sekalian baca judul, kanal,
      dan durasi asli. <b>Review manual:</b> klik <b>▶ tonton</b> buat buka videonya, terus tandai
      <b>OK</b> (gerakan benar &amp; aman) atau <b>GANTI</b> (salah/ragu). Tanda kesimpen otomatis di browser ini
      dan bisa diekspor ke CSV.
    </p>
  </div>

  <div class="panel">
    <table>
      <thead><tr><th>#</th><th>Kategori</th><th>Level</th><th>Gerakan</th><th>Video YouTube</th><th>Durasi</th><th>Embed</th><th>Review</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>

<div id="stage"></div>

<script>
var SLOTS = ${JSON.stringify(slots)};
var PARALLEL = 6;
var PLAYER_TIMEOUT_MS = 8000;
var LSKEY = 'w20fit_ex_video_review_v1';

var rowsEl = document.getElementById('rows');
var els = [];
var state = SLOTS.map(function(){ return { status:'idle', detail:'', title:'', author:'', secs:null }; });
var stopped = false;

var review = {};
try { review = JSON.parse(localStorage.getItem(LSKEY) || '{}') || {}; } catch(e) { review = {}; }
function saveReview(){ try { localStorage.setItem(LSKEY, JSON.stringify(review)); } catch(e){} }

function fmtDur(secs){ if(secs==null) return '—'; var m=Math.floor(secs/60), s=Math.round(secs%60); return m+':'+(s<10?'0':'')+s; }

function tag(status, detail){
  if (status === 'ok')   return '<span class="tag t-ok">AMAN</span>';
  if (status === 'bad')  return '<span class="tag t-bad">' + detail + '</span>';
  if (status === 'warn') return '<span class="tag t-warn">' + detail + '</span>';
  if (status === 'busy') return '<span class="tag t-idle">memeriksa…</span>';
  return '<span class="tag t-idle">belum</span>';
}

SLOTS.forEach(function(s, i){
  var tr = document.createElement('tr');
  var watch = s.vid ? ('https://www.youtube.com/watch?v=' + s.vid) : '#';
  tr.innerHTML = '<td>' + (i+1) + '</td>' +
    '<td><span class="chip">' + s.kat + '</span></td>' +
    '<td><span class="chip">' + s.lvl + '</span></td>' +
    '<td>' + s.nama + '<br><span class="id" style="color:var(--faint)">' + (s.vid || 'ID KOSONG') + '</span>' +
      (s.vid ? ' · <a href="' + watch + '" target="_blank" rel="noopener">▶ tonton</a>' : '') + '</td>' +
    '<td class="yt"></td><td class="dur"></td><td class="st"></td>' +
    '<td class="verdict">' +
      '<button class="ghost mini v-ok-btn">OK</button>' +
      '<button class="ghost mini v-bad-btn">GANTI</button>' +
      '<div class="rvnote" style="font-size:11px;color:var(--faint);margin-top:3px"></div>' +
    '</td>';
  rowsEl.appendChild(tr);
  els.push(tr);
  var okB = tr.querySelector('.v-ok-btn'), badB = tr.querySelector('.v-bad-btn');
  okB.addEventListener('click', function(){ setVerdict(i, review[s.id]==='ok'?'':'ok'); });
  badB.addEventListener('click', function(){ setVerdict(i, review[s.id]==='bad'?'':'bad'); });
});

function setVerdict(i, v){
  var id = SLOTS[i].id;
  if (v) review[id] = v; else delete review[id];
  saveReview(); paintVerdict(i); counts(); applyFilter(i);
}
function paintVerdict(i){
  var s = SLOTS[i], v = review[s.id];
  var okB = els[i].querySelector('.v-ok-btn'), badB = els[i].querySelector('.v-bad-btn');
  okB.className = 'ghost mini v-ok-btn' + (v==='ok' ? ' v-ok' : '');
  badB.className = 'ghost mini v-bad-btn' + (v==='bad' ? ' v-bad' : '');
  els[i].querySelector('.rvnote').textContent = v==='ok' ? 'disetujui' : (v==='bad' ? 'perlu diganti' : 'belum di-review');
}

function paint(i){
  var st = state[i], s = SLOTS[i];
  els[i].children[4].innerHTML = st.title
    ? (st.title + '<br><span style="color:var(--faint); font-size:12px;">' + st.author + '</span>')
    : '';
  els[i].children[5].innerHTML = '<span style="color:var(--soft)">' + fmtDur(st.secs) + '</span>';
  els[i].children[6].innerHTML = tag(st.status, st.detail);
  paintVerdict(i);
  applyFilter(i);
}
function applyFilter(i){
  var s = SLOTS[i], st = state[i];
  var catOk = !fCatVal || s.kat === fCatVal;
  var flagged = st.status === 'bad' || st.status === 'warn' || !review[s.id];
  var show = catOk && (!document.getElementById('onlyBad').checked || flagged);
  els[i].className = show ? '' : 'hide';
}
var fCatVal = '';
function repaint(){ for (var i=0;i<state.length;i++) paint(i); }
document.getElementById('onlyBad').addEventListener('change', repaint);
document.getElementById('fCat').addEventListener('change', function(){ fCatVal = this.value; repaint(); });

function counts(){
  var ok=0, bad=0, warn=0, done=0, vok=0, vbad=0;
  state.forEach(function(s){
    if (s.status==='ok'){ ok++; done++; }
    else if (s.status==='bad'){ bad++; done++; }
    else if (s.status==='warn'){ warn++; done++; }
  });
  SLOTS.forEach(function(s){ if(review[s.id]==='ok')vok++; else if(review[s.id]==='bad')vbad++; });
  document.getElementById('c-ok').textContent = ok;
  document.getElementById('c-bad').textContent = bad;
  document.getElementById('c-warn').textContent = warn;
  document.getElementById('c-done').textContent = done;
  document.getElementById('c-vok').textContent = vok;
  document.getElementById('c-vbad').textContent = vbad;
  document.getElementById('progress').style.width = (done / SLOTS.length * 100) + '%';
}

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
    s.onerror = function(){ finish({ ok:false, reason:'HILANG / PRIVAT' }); };
    s.src = 'https://www.youtube.com/oembed?format=json&callback=' + cb +
            '&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
    document.body.appendChild(s);
  });
}

var apiReady = new Promise(function(resolve){
  window.onYouTubeIframeAPIReady = resolve;
  var s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.body.appendChild(s);
});

function makePlayer(){
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
    try { p.player.cueVideoById(slot.vid); } catch (err) { finish({ status:'warn', detail:'GAGAL MEMUAT' }); }
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

var CONTROL_ID = 'BgCbQJJddBY';

async function run(){
  stopped = false;
  document.getElementById('run').disabled = true;
  document.getElementById('stop').disabled = false;

  document.getElementById('phase').textContent = '· cek koneksi ke YouTube';
  var control = await oembed(CONTROL_ID);
  if (!control.ok) {
    document.getElementById('phase').textContent = '';
    alert('Browser ini tidak bisa menghubungi YouTube.\\n\\nSemua video akan terlihat rusak padahal belum tentu. ' +
          'Buka halaman ini di jaringan yang bisa akses YouTube, lalu jalankan lagi.');
    document.getElementById('run').disabled = false;
    document.getElementById('stop').disabled = true;
    return;
  }

  SLOTS.forEach(function(s, i){ if (!s.vid) { state[i] = { status:'bad', detail:'ID KOSONG' }; paint(i); } });
  counts();

  var todo = SLOTS.map(function(s, i){ return { s:s, i:i }; }).filter(function(x){ return !!x.s.vid; });

  document.getElementById('phase').textContent = '· tahap 1: cek keberadaan';
  var survivors = [];
  await runPool(todo, 8, async function(x){
    state[x.i] = { status:'busy', detail:'' }; paint(x.i);
    var r = await oembed(x.s.vid);
    if (r.ok) { survivors.push(x); state[x.i] = { status:'busy', detail:'', title:r.title, author:r.author, secs:null }; }
    else { state[x.i] = { status:'bad', detail:r.reason, title:'', author:'', secs:null }; }
    paint(x.i); counts();
  });
  if (stopped) return finishRun();

  document.getElementById('phase').textContent = '· tahap 2: cek embed (butuh beberapa menit)';
  await apiReady;
  var players = [];
  for (var k = 0; k < PARALLEL; k++) players.push(await makePlayer());
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

function snapshot(){
  return SLOTS.map(function(s, i){
    var st = state[i];
    return { id:s.id, nama:s.nama, kategori:s.kat, level:s.lvl, videoId:s.vid,
             url:(s.vid?('https://www.youtube.com/watch?v='+s.vid):''),
             embedStatus:st.status, embedDetail:st.detail,
             ytTitle:st.title, ytChannel:st.author,
             durationSec:(st.secs!=null?Math.round(st.secs):null),
             review:(review[s.id]||'') };
  });
}
function csvEscape(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }

document.getElementById('run').addEventListener('click', run);
document.getElementById('stop').addEventListener('click', function(){ stopped = true; });
document.getElementById('dl').addEventListener('click', function(){
  var report = { checkedAt:new Date().toISOString(), total:SLOTS.length, rows:snapshot() };
  var blob = new Blob([JSON.stringify(report, null, 2)], { type:'application/json' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'exercise-video-check.json'; a.click();
});
document.getElementById('csv').addEventListener('click', function(){
  var head = ['kategori','level','nama','video_url','embed_status','embed_detail','yt_title','yt_channel','durasi_detik','review'];
  var lines = [head.join(',')].concat(snapshot().map(function(r){
    return [r.kategori,r.level,r.nama,r.url,r.embedStatus,r.embedDetail,r.ytTitle,r.ytChannel,r.durationSec,r.review].map(csvEscape).join(',');
  }));
  var blob = new Blob([lines.join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'exercise-video-review.csv'; a.click();
});

repaint(); counts();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page(rows));
console.log(`${rows.length} gerakan · ${cats.length} kategori`);
console.log(`ditulis: ${path.relative(ROOT, OUT)}`);
