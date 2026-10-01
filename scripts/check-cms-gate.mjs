// Gerbang masuk CMS: member ditolak + dikeluarkan, coach/admin masuk, dan tidak
// ada kelip dasbor sebelum pengecekan selesai. Diuji untuk dua keadaan: setelah
// supabase/pending/cms_access.sql dijalankan (cms_me ada) dan sebelum (404 -> jalur lama).
const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="472" height="160"><rect width="472" height="160" fill="#888"/></svg>');
const gagal = [];
async function coba(label, { cmsMe, legacyRole }, harusMasuk) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let logoutDipanggil = false;
  await p.route('**://*.supabase.co/**', (r) => {
    const u = r.request().url();
    const J = (x, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (/\/auth\/v1\/logout/.test(u)) { logoutDipanggil = true; return J({}); }
    if (/rpc\/cms_me/.test(u)) return cmsMe === undefined
      ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not found"}' })
      : J(cmsMe);
    if (/rpc\/w20fit_my_role/.test(u)) return J(legacyRole === undefined ? null : legacyRole);
    return J([]);
  });
  await p.route('**://media.20fit.id/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: logo }));
  for (const x of ['**://*.ytimg.com/**','**://images.unsplash.com/**','**://*.youtube.com/**']) await p.route(x, (r) => r.abort());
  await p.addInitScript(() => localStorage.setItem('20fit_sb_session', JSON.stringify({ access_token:'t', refresh_token:'r', expires_at: Date.now()+86400000, user:{ id:'uid-x', email:'x@20fit.id' } })));
  // amati apakah dasbor sempat berkelip sebelum pengecekan selesai
  await p.addInitScript(() => { window.__flash = false;
    const obs = () => { if (/Kelola koleksi|Manage collections|KELOLA KATEGORI/i.test(document.body.innerText||'')) window.__flash = true; };
    const iv = setInterval(obs, 30); setTimeout(() => clearInterval(iv), 4000); });
  await p.goto(BASE + '/cms', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);
  const t = await p.evaluate(() => ((document.querySelector('.tt-main')||document.body).innerText||'').replace(/\n+/g,' / ').slice(0, 110));
  const flash = await p.evaluate(() => window.__flash);
  const ditolak = /tidak punya akses|no access to the CMS/i.test(await p.evaluate(() => document.body.innerText||''));
  console.log(label.padEnd(34), ditolak ? 'DITOLAK' : 'MASUK  ', '| logout dipanggil:', logoutDipanggil, '| kelip dasbor:', flash, '|', t.slice(0, 70));
  if (errs.length) { console.log('   JS ERROR:', [...new Set(errs)].join(' | ')); gagal.push(label + ': error JS'); }
  if (harusMasuk && ditolak) gagal.push(label + ': seharusnya masuk tapi ditolak');
  if (!harusMasuk && !ditolak) gagal.push(label + ': seharusnya ditolak tapi masuk');
  if (!harusMasuk && !logoutDipanggil) gagal.push(label + ': ditolak tapi sesinya tidak diakhiri');
  if (!harusMasuk && flash) gagal.push(label + ': dasbor sempat berkelip');
  await ctx.close();
}
await coba('member (cms_me is_staff=false)', { cmsMe: { is_staff: false, is_admin: false } }, false);
await coba('coach (cms_me is_staff=true)',   { cmsMe: { is_staff: true, is_admin: false, units: ['arena'] } }, true);
await coba('admin (cms_me is_admin=true)',   { cmsMe: { is_staff: true, is_admin: true, units: ['all'] } }, true);
await coba('SQL belum jalan + member',       { legacyRole: null }, false);
await coba('SQL belum jalan + coach lama',   { legacyRole: 'coach' }, true);
if (gagal.length) { console.log('GAGAL: ' + gagal.join('; ')); process.exitCode = 1; }
else console.log('gerbang CMS benar di 5 skenario ✓');
await b.close();
