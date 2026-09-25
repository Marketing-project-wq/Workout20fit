// PROBE (read-only) — lihat bentuk asli data Hevy API sebelum memutuskan integrasi.
//
// Skrip ini HANYA membaca (GET). Tidak menulis ke Hevy, tidak menyentuh
// data/exercise-library.json maupun Supabase. Tujuannya satu: menampilkan
// schema asli exercise_templates (dan opsional workouts) supaya kita berhenti
// menebak-nebak field-nya.
//
// CATATAN: api.hevyapp.com diblokir dari container Claude — jalankan ini di
// mesin lokal yang punya akses internet ke Hevy.
//
// Pakai:
//   HEVY_API_KEY=xxxxx node scripts/probe-hevy.mjs                 # exercise_templates
//   HEVY_API_KEY=xxxxx node scripts/probe-hevy.mjs workouts        # workouts
//   HEVY_API_KEY=xxxxx node scripts/probe-hevy.mjs routines        # routine_folders
//
// API key diambil dari hevy.com/settings?developer (butuh Hevy Pro).
// Belum diverifikasi langsung ke docs — kalau ada field/endpoint yang tak
// sesuai, itu wajar; sesuaikan dengan yang muncul di output.

const API_KEY = process.env.HEVY_API_KEY;
const BASE = 'https://api.hevyapp.com/v1';

if (!API_KEY) {
  console.error('❌ HEVY_API_KEY belum di-set. Contoh:');
  console.error('   HEVY_API_KEY=xxxxx node scripts/probe-hevy.mjs');
  process.exit(1);
}

const KIND = (process.argv[2] || 'templates').toLowerCase();
const ENDPOINT = {
  templates: 'exercise_templates',
  workouts: 'workouts',
  routines: 'routine_folders',
}[KIND];

if (!ENDPOINT) {
  console.error(`❌ Argumen tak dikenal: "${KIND}". Pilih: templates | workouts | routines`);
  process.exit(1);
}

// Ambil beberapa halaman kecil saja — cukup untuk melihat schema, bukan
// menarik seluruh katalog.
const PAGE_SIZE = 10;
const MAX_PAGES = Number(process.env.MAX_PAGES || 2);

async function getPage(page) {
  const url = `${BASE}/${ENDPOINT}?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: { 'api-key': API_KEY, accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

// Coba beberapa nama field yang mungkin dipakai untuk array item — kita tidak
// tahu pasti apakah kuncinya "exercise_templates", "workouts", "data", dst.
function pickItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const k of [ENDPOINT, 'data', 'items', 'results']) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  // fallback: array pertama yang ditemukan
  for (const v of Object.values(payload || {})) if (Array.isArray(v)) return v;
  return [];
}

function summarizeFields(items) {
  const keys = new Set();
  const enums = {}; // field -> Set nilai (untuk field yang tampak seperti enum pendek)
  const ENUMISH = ['type', 'exercise_type', 'equipment', 'primary_muscle_group', 'category', 'is_custom'];
  for (const it of items) {
    if (it && typeof it === 'object') {
      for (const k of Object.keys(it)) keys.add(k);
      for (const f of ENUMISH) {
        if (f in it) (enums[f] ||= new Set()).add(JSON.stringify(it[f]));
      }
    }
  }
  return { keys: [...keys].sort(), enums };
}

(async () => {
  console.log(`\n🔎 Probe read-only: GET /${ENDPOINT} (pageSize=${PAGE_SIZE}, maxPages=${MAX_PAGES})\n`);
  const all = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const payload = await getPage(page);
      if (page === 1) {
        console.log('--- Bentuk payload halaman 1 (kunci teratas) ---');
        console.log(Array.isArray(payload) ? '[array]' : Object.keys(payload || {}));
        console.log('');
      }
      const items = pickItems(payload);
      all.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
  } catch (err) {
    console.error('❌ Gagal memanggil Hevy:\n' + err.message);
    console.error('\nKalau ini "fetch failed"/timeout dari container Claude: itu wajar, host Hevy diblokir di sini. Jalankan di mesin lokal.');
    process.exit(1);
  }

  console.log(`✅ Dapat ${all.length} item.\n`);
  if (all.length) {
    console.log('--- CONTOH 1 ITEM (JSON asli) ---');
    console.log(JSON.stringify(all[0], null, 2));
    console.log('\n--- RINGKASAN FIELD ---');
    const { keys, enums } = summarizeFields(all);
    console.log('Semua field:', keys.join(', '));
    for (const [f, set] of Object.entries(enums)) {
      console.log(`  ${f}: ${[...set].slice(0, 20).join(', ')}${set.size > 20 ? ' …' : ''}`);
    }
  }
})();
