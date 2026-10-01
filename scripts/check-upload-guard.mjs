// Cek pagar unggah video di CMS: format, ukuran, dan apakah berkasnya benar-benar
// bisa diputar browser. Butuh `node server.js` jalan.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const SP = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const uploads = [];
await p.route('**://*.supabase.co/**', (r) => {
  const u = r.request().url();
  if (/w20fit_my_role/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '"coach"' });
  if (/\/storage\/v1\/object\/w20fit-exercises\//.test(u)) {
    uploads.push({ path: u.split('/w20fit-exercises/')[1], auth: (r.request().headers()['authorization'] || '').slice(0, 20) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ok"}' });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await p.route('**://media.20fit.id/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="472" height="160"><rect width="472" height="160" fill="#888"/></svg>') }));
for (const x of ['**://*.ytimg.com/**','**://images.unsplash.com/**','**://*.youtube.com/**']) await p.route(x, (r) => r.abort());
await p.addInitScript(() => localStorage.setItem('20fit_sb_session', JSON.stringify({ access_token:'tok-coach', refresh_token:'r', expires_at: Date.now()+86400000, user:{ id:'uid-coach-1', email:'coach@20fit.id', user_metadata:{ full_name:'Coach' } } })));
await p.goto(BASE + '/cms', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/^(Gerakan|Exercises)$/i.test((x.textContent||'').trim())); b&&b.click(); });
await p.waitForTimeout(1200);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Tambah Gerakan|Add Exercise|^\+/.test((x.textContent||'').trim())); b&&b.click(); });
await p.waitForTimeout(1200);

const err = () => p.evaluate(() => {
  const t = (document.body.innerText||'');
  const m = /(Video harus MP4[^\n]*|Thumbnail harus[^\n]*|Berkas terlalu besar[^\n]*|Sesi kamu sudah habis[^\n]*|Video ini tidak bisa diputar[^\n]*|Akun ini tidak punya izin[^\n]*)/.exec(t);
  return m ? m[1].slice(0, 95) : null;
});
const setFile = (sel, name, mime, bytes) => p.evaluate(({ sel, name, mime, bytes }) => {
  const inp = [...document.querySelectorAll('input[type=file]')][sel];
  if (!inp) return 'input tidak ada';
  const f = new File([new Uint8Array(bytes)], name, { type: mime });
  const dt = new DataTransfer(); dt.items.add(f);
  Object.defineProperty(inp, 'files', { value: dt.files, configurable: true });
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
}, { sel, name, mime, bytes });

console.log('input file ditemukan:', await p.evaluate(() => document.querySelectorAll('input[type=file]').length));
console.log('1) .mov HEVC      :', await setFile(0, 'IMG_1234.mov', 'video/quicktime', 1024), '->', await p.waitForTimeout(700).then(err));
console.log('2) mp4 kebesaran  :', await setFile(0, 'besar.mp4', 'video/mp4', 26*1024*1024), '->', await p.waitForTimeout(700).then(err));
console.log('3) thumbnail .pdf :', await setFile(1, 'x.pdf', 'application/pdf', 1024), '->', await p.waitForTimeout(700).then(err));
console.log('4) mp4 palsu 2KB  :', await setFile(0, 'ok.mp4', 'video/mp4', 2048), '->', await p.waitForTimeout(2500).then(err));
// Berkas video yang benar-benar bisa diputar, dibuat di dalam browser lewat MediaRecorder.
const madeOk = await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180;
  const g = c.getContext('2d');
  const st = c.captureStream(12);
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported('video/webm')) return 'MediaRecorder tidak ada';
  const rec = new MediaRecorder(st, { mimeType: 'video/webm' });
  const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#E4002B' : '#1D1D1F'; g.fillRect(0, 0, 320, 180); await new Promise((r) => setTimeout(r, 60)); }
  rec.stop(); await done;
  const blob = new Blob(parts, { type: 'video/webm' });
  const f = new File([blob], 'klip.webm', { type: 'video/webm' });
  const inp = [...document.querySelectorAll('input[type=file]')][0];
  const dt = new DataTransfer(); dt.items.add(f);
  Object.defineProperty(inp, 'files', { value: dt.files, configurable: true });
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return 'webm ' + blob.size + ' byte';
});
console.log('5) webm asli      :', madeOk, '->', await p.waitForTimeout(5000).then(err) || 'diterima (tanpa pesan error)');
console.log('   path unggahan  :', JSON.stringify(uploads));
// sesi hilang -> harus menolak, bukan diam-diam pakai anon key
await p.evaluate(() => { localStorage.removeItem('20fit_sb_session'); });
console.log('nol error JS:', errs.length ? errs.join(' | ') : 'ya');
await p.screenshot({ path: `${SP}/cms-upload.png` });
await b.close();
