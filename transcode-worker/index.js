// 20FIT — Worker transcode video gerakan.
//
// Alur: CMS upload file MENTAH ke Supabase storage (path ex/<uid>/raw/...),
// lalu memanggil POST /transcode { id, raw_path }. Worker ini:
//   1. memvalidasi JWT staff (cms_me) si pemanggil,
//   2. unduh file mentah dari storage,
//   3. ffmpeg -> H.264/AAC MP4 standar web (faststart) + poster JPG,
//   4. unggah hasil ke path final, ffprobe durasi,
//   5. update baris w20fit_exercises: video_url final, media_state='ready'.
//
// Semua kredensial lewat ENV (lihat README). Tidak ada dependency npm.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.BUCKET || 'w20fit-exercises';
const TABLE = process.env.TABLE || 'w20fit_exercises';
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // mis. https://workout.20fit.id
const MAX_W = parseInt(process.env.MAX_WIDTH || '1280', 10); // batas lebar; tinggi ikut rasio
const REQUIRE_STAFF = (process.env.REQUIRE_STAFF || '1') !== '0';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di-set.');
  process.exit(1);
}

const svcHeaders = { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY };

// ---- antrean sederhana: proses satu per satu biar CPU tidak kewalahan ----
const queue = [];
let busy = false;
function enqueue(job) { queue.push(job); pump(); }
async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try { await processJob(job); }
  catch (e) { console.error('[job] gagal', job.id, e && e.message); await setState(job.id, 'failed', e && e.message); }
  finally { busy = false; setImmediate(pump); }
}

// ---- util http ----
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('body bukan JSON')); } });
    req.on('error', reject);
  });
}

// ---- validasi pemanggil: token user valid + (opsional) staff ----
async function verifyCaller(req) {
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return { ok: false, code: 401, msg: 'tidak ada token' };
  const token = m[1];
  const u = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + token },
  });
  if (!u.ok) return { ok: false, code: 401, msg: 'token tidak valid' };
  if (!REQUIRE_STAFF) return { ok: true };
  // cek staf lewat RPC cms_me (pakai token user). Kalau RPC belum ada (404) -> lewati cek.
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/cms_me', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: '{}',
    });
    if (r.status === 404) return { ok: true }; // jalur lama: tidak memblokir
    if (!r.ok) return { ok: false, code: 403, msg: 'gagal cek akses' };
    const j = await r.json().catch(() => null);
    const row = Array.isArray(j) ? j[0] : j;
    const staff = row && (row.is_staff || row.is_admin || row.staff || row.admin);
    if (!staff) return { ok: false, code: 403, msg: 'bukan staf' };
    return { ok: true };
  } catch (e) { return { ok: false, code: 403, msg: 'gagal cek akses' }; }
}

// ---- storage helpers ----
function publicUrl(path) { return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path; }
async function downloadObject(path, dest) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + encodeURI(path), { headers: svcHeaders });
  if (!r.ok) throw new Error('unduh gagal (' + r.status + ') ' + path);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}
async function uploadObject(path, filePath, contentType) {
  const body = await readFile(filePath);
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + encodeURI(path), {
    method: 'POST',
    headers: { ...svcHeaders, 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body,
  });
  if (!r.ok) throw new Error('unggah gagal (' + r.status + ') ' + path + ' :: ' + (await r.text().catch(() => '')));
}
async function patchRow(id, fields) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!r.ok) throw new Error('update baris gagal (' + r.status + ') :: ' + (await r.text().catch(() => '')));
}
async function setState(id, state, note) {
  try { await patchRow(id, note ? { media_state: state, media_error: String(note).slice(0, 300) } : { media_state: state }); }
  catch (e) { console.error('setState gagal', e && e.message); }
}

// ---- ffmpeg/ffprobe ----
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(cmd + ' keluar ' + code + ': ' + err.slice(-500))));
  });
}
async function probeDuration(file) {
  try { const s = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]); const n = parseFloat(s); return Number.isFinite(n) ? Math.round(n) : null; }
  catch { return null; }
}

// ---- inti ----
async function processJob(job) {
  const { id, raw_path } = job;
  const dir = await mkdtemp(join(tmpdir(), 'w20fit-'));
  const rawExt = (raw_path.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const rawFile = join(dir, 'raw.' + rawExt);
  const outFile = join(dir, 'out.mp4');
  const posFile = join(dir, 'poster.jpg');
  // path final: buang segmen "raw/", ganti ekstensi jadi .mp4
  const base = raw_path.replace(/(^|\/)raw\//, '$1').replace(/\.[^./]+$/, '');
  const finalPath = base + '.mp4';
  const posterPath = base + '-poster.jpg';
  try {
    await setState(id, 'processing');
    await downloadObject(raw_path, rawFile);
    // H.264 High, yuv420p (wajib buat kompat luas), faststart, skala turun kalau > MAX_W, audio AAC.
    await run('ffmpeg', ['-y', '-i', rawFile,
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast', '-crf', '23',
      '-vf', "scale='min(" + MAX_W + ",iw)':-2",
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart', outFile]);
    // poster dari detik ke-0.5 video hasil
    try { await run('ffmpeg', ['-y', '-ss', '0.5', '-i', outFile, '-frames:v', '1', '-q:v', '3', posFile]); } catch (e) { /* poster opsional */ }
    const dur = await probeDuration(outFile);
    await uploadObject(finalPath, outFile, 'video/mp4');
    let posterUrl = null;
    try { await stat(posFile); await uploadObject(posterPath, posFile, 'image/jpeg'); posterUrl = publicUrl(posterPath); } catch (e) { /* skip */ }
    const fields = { video_url: publicUrl(finalPath), media_state: 'ready', video_verified: true, media_error: null };
    if (dur != null) fields.durasi_detik = dur;
    if (posterUrl) fields.thumbnail_url = posterUrl;
    await patchRow(id, fields);
    console.log('[ok]', id, '->', finalPath, dur ? dur + 's' : '');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, busy, queued: queue.length });
  if (req.method === 'POST' && (req.url === '/transcode' || req.url.startsWith('/transcode?'))) {
    try {
      const auth = await verifyCaller(req);
      if (!auth.ok) return sendJson(res, auth.code, { error: auth.msg });
      const body = await readBody(req);
      const id = body.id; const raw_path = body.raw_path || body.rawPath;
      if (!id || !raw_path) return sendJson(res, 400, { error: 'id dan raw_path wajib' });
      if (/\.\.|^\/|^https?:/i.test(raw_path)) return sendJson(res, 400, { error: 'raw_path tidak valid' });
      enqueue({ id, raw_path });
      return sendJson(res, 202, { state: 'processing', queued: queue.length });
    } catch (e) { return sendJson(res, 500, { error: (e && e.message) || 'error' }); }
  }
  return sendJson(res, 404, { error: 'not found' });
});
server.listen(PORT, () => console.log('transcode-worker listening on ' + PORT + ' (bucket ' + BUCKET + ')'));
