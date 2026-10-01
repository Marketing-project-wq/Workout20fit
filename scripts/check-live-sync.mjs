// Cek sinkron langsung: katalog & gerakan harus tersegarkan tanpa reload, lewat
// jalur Realtime (WebSocket di-stub) maupun jaring pengaman polling.
// Butuh `node server.js` jalan. PW_MODULE / PW_CHROMIUM / BASE bisa di-override.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const SP = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const TYPE = { id: 1, key: 'hyrox', color: 'linear-gradient(135deg,#2A2A2D,#E4002B)', emoji: '🏋️', label: 'HYROX', photo: '' };
const PROG = { id: 'cp1', name: 'SESI UJI REALTIME', jenis: 'hyrox', duration: '20 menit', kalori: 200,
  status: 'published', workoutIds: [], tujuan: '', focus: '', video: 'https://youtu.be/aaaaaaaaaaa', level: 'pemula' };
const BLOB_BARU = { types: [TYPE], programs: [PROG], workouts: [], collections: [], series: [], hero: '' };

const EX = (n) => ({ id: 'ex-' + n, nama: 'Gerakan Uji ' + n, slug: 'gerakan-uji-' + n,
  video_url: 'https://youtu.be/bbbbbbbbbbb', thumbnail_url: null, deskripsi: null, cue_teknik: [],
  otot_target: [], level: 'pemula', alat: [], durasi_detik: 30, kontraindikasi: null,
  status: 'terbit', kategori: 'hyrox', tujuan: [], inti: false, video_verified: true,
  media_state: 'ready', owner_id: 'u-coach', created_at: '2026-10-01T07:00:00Z', updated_at: '2026-10-01T07:00:00Z' });

const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="472" height="160"><rect width="472" height="160" fill="#888"/></svg>');

async function makePage(state) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**://media.20fit.id/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: logo }));
  for (const x of ['**://*.ytimg.com/**', '**://images.unsplash.com/**', '**://*.youtube.com/**', '**://img.youtube.com/**'])
    await p.route(x, (r) => r.abort());
  await p.route('**://*.supabase.co/**', (r) => {
    const u = r.request().url();
    const J = (body, headers) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: headers || {} });
    if (/w20fit_workout_cms/.test(u)) {
      if (/select=updated_at/.test(u)) return J([{ updated_at: state.cmsStamp }]);
      return J(state.cmsBlob ? [{ data: state.cmsBlob }] : []);
    }
    if (/w20fit_exercises/.test(u)) {
      if (/select=updated_at/.test(u)) return J([{ updated_at: state.exStamp }], { 'content-range': '0-0/' + state.ex.length });
      return J(state.ex);
    }
    if (/w20fit_my_role/.test(u)) return J('member');
    return J([]);
  });
  return { ctx, p, errs };
}

const hubCounts = (p) => p.evaluate(() => {
  const t = (document.querySelector('.tt-main') || document.body).innerText || '';
  const g = /(\d+)\s*tersedia/.exec(t);
  const k = /(\d+)\s*kategori\s*·\s*(\d+)\s*sesi/.exec(t);
  return { gerakan: g ? +g[1] : null, kategori: k ? +k[1] : null, sesi: k ? +k[2] : null };
});

// ---------- 1. jaring pengaman polling ----------
{
  const state = { cmsBlob: null, cmsStamp: '2026-10-01T06:00:00Z', ex: [], exStamp: '2026-10-01T06:00:00Z' };
  const { ctx, p, errs } = await makePage(state);
  await p.goto(BASE + '/workouts', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  // poll pertama cuma mencatat stempel awal (memang begitu rancangannya)
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(900);
  const before = await hubCounts(p);
  // publish dari CMS: blob berubah, stempel berubah
  state.cmsBlob = BLOB_BARU; state.cmsStamp = '2026-10-01T06:30:00Z';
  state.ex = [EX(1), EX(2)]; state.exStamp = '2026-10-01T06:30:00Z';
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(2200);
  const after = await hubCounts(p);
  console.log('POLLING  sebelum', JSON.stringify(before), '-> sesudah', JSON.stringify(after));
  console.log('  katalog tersegarkan tanpa reload:', (before.kategori === 11 && after.kategori === 1) ? 'YA ✓' : 'TIDAK ✗');
  console.log('  gerakan tersegarkan tanpa reload:', after.gerakan === 2 ? 'YA ✓' : 'TIDAK ✗');
  console.log('  error JS:', errs.length ? errs.join(' | ') : 'nol');
  if (after.gerakan === null) console.log('  (debug) cuplikan teks:', (await p.evaluate(() => ((document.querySelector('.tt-main')||document.body).innerText||'').slice(0, 220))).replace(/\n/g, ' / '));
  await p.screenshot({ path: `${SP}/live-poll.png` });
  await ctx.close();
}

// ---------- 2. jalur Realtime (WebSocket di-stub) ----------
{
  const state = { cmsBlob: null, cmsStamp: '2026-10-01T06:00:00Z', ex: [], exStamp: '2026-10-01T06:00:00Z' };
  const { ctx, p, errs } = await makePage(state);
  await p.addInitScript(() => {
    window.__ws = { urls: [], sent: [] };
    class FakeWS {
      constructor(url) {
        this.url = url; this.readyState = 0; window.__ws.urls.push(url); window.__ws.last = this;
        setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 30);
      }
      send(d) { window.__ws.sent.push(d); }
      close() { this.readyState = 3; this.onclose && this.onclose(); }
    }
    window.WebSocket = FakeWS;
  });
  await p.goto(BASE + '/workouts', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  const join = await p.evaluate(() => {
    const j = (window.__ws.sent || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } })
      .filter(Boolean).find((m) => m.event === 'phx_join');
    return { url: window.__ws.urls[0] || null, tables: j ? (j.payload.config.postgres_changes || []).map((c) => c.table) : null, topic: j && j.topic };
  });
  console.log('REALTIME url  :', join.url);
  console.log('REALTIME join :', join.topic, JSON.stringify(join.tables));
  const before = await hubCounts(p);
  await p.evaluate((ex) => {
    const ws = window.__ws.last;
    ws.onmessage({ data: JSON.stringify({ event: 'postgres_changes', topic: 'realtime:w20fit',
      payload: { data: { table: 'w20fit_exercises', type: 'INSERT', record: ex, old_record: null } } }) });
  }, EX(9));
  await p.waitForTimeout(900);
  const after = await hubCounts(p);
  console.log('REALTIME gerakan', before.gerakan, '->', after.gerakan, after.gerakan === 1 ? '✓ muncul tanpa reload' : '✗');
  // putus sambungan: harus mundur bertahap, bukan membanjiri
  await p.evaluate(() => window.__ws.last.close());
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => window.__ws.urls.length);
  console.log('REALTIME sambung ulang setelah putus:', n > 1 ? 'YA ✓ (' + n + ' percobaan)' : 'belum (' + n + ')');
  console.log('  error JS:', errs.length ? errs.join(' | ') : 'nol');
  await ctx.close();
}
await b.close();
