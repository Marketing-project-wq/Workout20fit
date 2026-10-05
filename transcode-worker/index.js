// 20FIT — Mesin konversi video (pure transcode function).
//
// SEDERHANA: terima file video di body POST /transcode, konversi ke H.264/AAC
// MP4 standar web pakai ffmpeg, lalu KEMBALIKAN file hasilnya langsung di body
// respons. Worker ini TIDAK menyentuh Supabase sama sekali (tidak butuh
// service_role). Browser yang unggah hasilnya ke storage.
//
// Alur: CMS kirim file mentah -> worker konversi -> balikin MP4 -> CMS unggah
// ke Supabase -> simpan. Gagal langsung ketahuan di CMS (tidak ada state
// 'processing' yang bisa nyangkut).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_W = parseInt(process.env.MAX_WIDTH || '1280', 10);
const MAX_BYTES = parseInt(process.env.MAX_BYTES || String(200 * 1024 * 1024), 10);

function cors(res, extra) {
  res.setHeader('access-control-allow-origin', ALLOWED_ORIGIN);
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-expose-headers', 'x-video-duration, x-video-error');
  if (extra) for (const k in extra) res.setHeader(k, extra[k]);
}
function json(res, code, obj) {
  const b = JSON.stringify(obj); cors(res);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) });
  res.end(b);
}
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args); let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve() : reject(new Error(cmd + ' exit ' + c + ': ' + err.slice(-500))));
  });
}
function probeDuration(f) {
  return new Promise((res) => {
    try {
      const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]);
      let o = ''; p.stdout.on('data', d => o += d);
      p.on('close', () => { const n = parseFloat(o); res(Number.isFinite(n) ? Math.round(n) : 0); });
      p.on('error', () => res(0));
    } catch { res(0); }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && (req.url === '/transcode' || req.url.startsWith('/transcode?'))) {
    const auth = req.headers['authorization'] || '';
    if (!/^Bearer\s+.+/i.test(auth)) return json(res, 401, { error: 'no token' });
    const dir = await mkdtemp(join(tmpdir(), 'w20-'));
    const inF = join(dir, 'in'); const outF = join(dir, 'out.mp4');
    const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
    try {
      // 1) terima file ke disk (dengan batas ukuran)
      await new Promise((resolve, reject) => {
        let n = 0; const ws = createWriteStream(inF);
        req.on('data', c => { n += c.length; if (n > MAX_BYTES) { ws.destroy(); req.destroy(); reject(new Error('file terlalu besar')); } });
        req.on('error', reject); ws.on('error', reject); ws.on('finish', resolve);
        req.pipe(ws);
      });
      // 2) konversi ke H.264/AAC MP4 standar (yuv420p + faststart = jalan di semua pemutar)
      await run('ffmpeg', ['-y', '-i', inF,
        '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast', '-crf', '23',
        '-vf', "scale='min(" + MAX_W + ",iw)':-2",
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-movflags', '+faststart', outF]);
      // 3) balikin file hasilnya + durasi di header
      const dur = await probeDuration(outF);
      const buf = await readFile(outF);
      cors(res, { 'x-video-duration': String(dur) });
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': buf.length });
      res.end(buf);
      console.log('[ok] transcoded', buf.length, 'bytes,', dur + 's');
    } catch (e) {
      console.error('[fail]', e && e.message);
      try { cors(res, { 'x-video-error': String((e && e.message) || 'gagal').slice(0, 120) }); json(res, 500, { error: (e && e.message) || 'transcode gagal' }); } catch (_) {}
    } finally { cleanup(); }
    return;
  }
  return json(res, 404, { error: 'not found' });
});
server.listen(PORT, () => console.log('transcode-worker (pure) listening on ' + PORT));
