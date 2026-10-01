// Ukur jeda mengetik di form CMS. Yang diukur waktu dari event input sampai layar
// tergambar, bukan kerja sinkronnya — biangnya memang bukan handler kita.
// Butuh `node server.js` jalan. Gagal kalau median di atas AMBANG ms.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const AMBANG = parseInt(process.env.AMBANG || '120', 10);
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
const EX = Array.from({ length: 498 }, (_, i) => ({ id: 'ex-' + i, nama: 'Gerakan ' + i, slug: 'g-' + i,
  video_url: 'https://youtu.be/aaaaaaaaaa' + (i % 10), thumbnail_url: null, deskripsi: 'Deskripsi ' + i,
  cue_teknik: ['satu','dua','tiga'], otot_target: ['dada'], level: 'pemula', alat: ['dumbbell'],
  durasi_detik: 30, kontraindikasi: null, status: 'terbit', kategori: 'hyrox', tujuan: ['bangun-otot'],
  inti: false, video_verified: true, media_state: 'ready', owner_id: 'u1',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }));
await p.route('**://*.supabase.co/**', (r) => {
  const u = r.request().url();
  const J = (x) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
  if (/w20fit_my_role/.test(u)) return J('admin');
  if (/w20fit_exercises/.test(u) && /select=\*/.test(u)) return J(EX);
  return J([]);
});
await p.route('**://media.20fit.id/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="472" height="160"><rect width="472" height="160" fill="#888"/></svg>') }));
for (const x of ['**://*.ytimg.com/**','**://images.unsplash.com/**','**://*.youtube.com/**']) await p.route(x, (r) => r.abort());
await p.addInitScript(() => localStorage.setItem('20fit_sb_session', JSON.stringify({ access_token:'t', refresh_token:'r', expires_at: Date.now()+86400000, user:{ id:'uid-1', email:'a@20fit.id', user_metadata:{ full_name:'Admin' } } })));
await p.goto(BASE + '/cms', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3200);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/^(Gerakan|Exercises)$/i.test((x.textContent||'').trim())); b&&b.click(); });
await p.waitForTimeout(1500);
await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Tambah Gerakan|Add Exercise/i.test((x.textContent||'').trim())); b&&b.click(); });
await p.waitForTimeout(1200);

const cdp = await ctx.newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
const hasil = await p.evaluate(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const afterPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))));
  // tugas panjang selama mengetik
  const longs = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}

  const ukur = async (el, label) => {
    const sync = [], total = [];
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      el.value = (el.value || '') + 'a';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      sync.push(Math.round(performance.now() - t0));          // kerja sinkron di handler
      const t1 = await afterPaint();
      total.push(Math.round(t1 - t0));                         // sampai tergambar
      await sleep(16);
    }
    sync.sort((a, z) => a - z); total.sort((a, z) => a - z);
    out[label] = { sinkron_median: sync[6], sinkron_maks: sync[11], sampai_gambar_median: total[6] };
  };

  const form = [...document.querySelectorAll('input[type=text], textarea')].filter((x) => x.offsetParent);
  await ukur(form[1], 'kolom_nama_form');


  out.longtask_terpanjang = longs.length ? Math.max(...longs) : 0;
  out.jumlah_longtask = longs.length;
  out.jumlah_node_dom = document.getElementsByTagName('*').length;
  return out;
});
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map(); let total = 0;
for (const id of profile.samples || []) {
  const n = byId.get(id); if (!n) continue; const f = n.callFrame;
  if ((f.functionName || '') === '(idle)') continue;
  total++;
  const key = (f.functionName || '(anonim)') + ' :' + f.lineNumber;
  self.set(key, (self.get(key) || 0) + 1);
}
console.log(JSON.stringify(hasil, null, 1));

console.log('--- CPU aktif (' + total + ' sampel) ---');
for (const [k, v] of [...self.entries()].sort((a, z) => z[1] - a[1]).slice(0, 16))
  console.log('  ' + String(Math.round(v / total * 100)).padStart(3) + '%  ' + k);
await b.close();
const med = hasil.kolom_nama_form && hasil.kolom_nama_form.sampai_gambar_median;
if (med == null) { console.log('kolom form tidak ketemu'); process.exitCode = 1; }
else if (med > AMBANG) { console.log('LEMOT: ' + med + 'ms > ambang ' + AMBANG + 'ms'); process.exitCode = 1; }
else console.log('jeda mengetik ' + med + 'ms (ambang ' + AMBANG + 'ms) ✓');
