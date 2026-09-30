// Cek berat font: bandingkan font-weight terkomputasi dengan berat yang benar-benar
// di-bundel. Butuh `node server.js` jalan di port 3000 (atau set BASE).
// Playwright dipakai dari PW_MODULE kalau ada, kalau tidak dari resolusi npm biasa.
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const OK = { 'Barlow Condensed': [700, 800, 900], 'JetBrains Mono': [400, 500, 600], 'Manrope': [200, 400, 700, 800] };
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const svg = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#1D1D1F"/></svg>`);
const bad = new Map();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await p.route('**://media.20fit.id/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(472, 160) }));
for (const x of ['**://*.ytimg.com/**','**://images.unsplash.com/**']) await p.route(x, (r) => r.abort());
await p.addInitScript(() => localStorage.setItem('20fit_sb_session', JSON.stringify({ access_token:'t', refresh_token:'r', expires_at: Date.now()+86400000, user:{ id:'u1', email:'f@20fit.id', user_metadata:{ full_name:'Ferdinand' } } })));
for (const route of ['/discover','/workouts','/favorites','/playlists','/account','/history']) {
  await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1700);
  const rows = await p.evaluate((OK) => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
      if (!t) continue;
      const cs = getComputedStyle(el);
      const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '');
      if (!OK[fam]) continue;
      const w = parseInt(cs.fontWeight, 10);
      if (!OK[fam].includes(w)) out.push(`${fam} ${w} · ${cs.fontSize} · "${t.slice(0, 26)}"`);
    }
    return out;
  }, OK);
  for (const r of rows) bad.set(r, (bad.get(r) || 0) + 1);
}
await b.close();
if (!bad.size) console.log('semua berat font tersedia ✓');
else { console.log('BERAT FONT TIDAK TERSEDIA:'); for (const [k, n] of [...bad.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  x${n}  ${k}`); process.exitCode = 1; }
