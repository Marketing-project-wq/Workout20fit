# 20FIT Workout — catatan kerja

## Cara menjawab permintaan saran tampilan

**Setiap kali diminta saran/rekomendasi soal tampilan, jawabannya harus berupa UI yang
bisa dilihat, bukan cuma tulisan.** Bikin design canvas lewat skill `design`: beberapa
artboard berdampingan, satu artboard per arah, plus satu artboard kondisi sekarang
sebagai pembanding. Tiap arah dikasih alasan dan tradeoff-nya masing-masing.

Jangan deploy apa pun sampai satu arah dipilih. Setelah dipilih, baru masuk ke kode.

Nilainya diambil dari sumber aslinya di `Workout 20FIT (1).html`, bukan dikira-kira —
token warna, font, radius, padding, grid.

## Bentuk aplikasi

Satu file bundel: `Workout 20FIT (1).html` (~1,3 MB). Di dalamnya ada satu baris panjang
berisi `<script type="__bundler/template">` (JSON), dan di dalam JSON itu ada
`<script type="text/x-dc" data-dc-script="">` yang memuat view-model aplikasi.

Cara aman mengubahnya: patch string di file mentah lewat script Python (di file mentah,
kutip ganda ditulis `\"` dan baris baru ditulis sebagai dua karakter `\n`), lalu validasi:

```bash
# 1. template JSON harus tetap bisa di-parse, 2. view-model harus lolos node --check
python3 -c "import re,json; H=open('Workout 20FIT (1).html').read(); json.loads(re.search(r'<script type=\"__bundler/template\"[^>]*>(.*?)</script>',H,re.S).group(1))"
```

QA-nya lewat Playwright + Chromium di `/opt/pw-browsers/chromium`, dengan server lokal
`node server.js` (port 3000). `media.20fit.id`, YouTube, dan Supabase diblokir dari
container ini — stub lewat route interception.

## Konten katalog

Sumber kebenaran konten CMS adalah **Supabase** (`w20fit_workout_cms`, baris `default`),
dan itu menang atas seed di bundel kalau isinya ada. Konsekuensinya:

- **Menambah** konten baru lewat seed tetap muncul di production — `_applyCmsLoaded`
  menambahkan baris seed yang id-nya belum ada.
- **Mengubah** konten yang sudah ada lewat seed tidak muncul kalau Supabase sudah punya
  baris dengan id itu. Perubahan seperti itu harus lewat CMS.

## Video

360 slot video (184 sesi + 176 episode). Dua alat:

- `npm run check:videos` — cek offline (slot kosong, id rusak, id dipakai dua kali) lalu
  probe oEmbed. Tidak bisa tahu apakah embed diizinkan.
- `npm run build:video-check` → `tools/video-check.html` — dibuka di browser yang bisa
  akses YouTube. Ini yang menangkap **embed dimatikan pemilik** (error 101/150), plus
  judul, kanal, dan durasi asli tiap video.

Video baru selalu dianggap **belum terverifikasi** sampai lolos `video-check.html`.
Cadangan per slot dicatat di `data/catalog-video-backups.json`.

Form sesi dan form episode di CMS memperingatkan kalau link videonya sudah dipakai slot
lain (`_videoUses`) — peringatan saja, tidak memblokir simpan, karena kadang satu video
memang sengaja dipakai dua kali.

## Bahasa

Semua teks lewat `L('id','en')`. Dua aturan: jangan ada kata Inggris yang bocor ke mode
Indonesia (dan sebaliknya), dan satu benda cuma punya satu nama di seluruh aplikasi.
Nama kategori olahraga (HYROX, Yoga, Strength, …) sengaja sama di dua bahasa.

Nama koleksi program tidak boleh berbagi kata dengan nama kategori mana pun — supaya dua
baris kartu di halaman Latihan tidak terbaca sebagai benda yang sama.

Koleksi bertema situasi (Kamar Hotel, Ramah Lutut, Duduk Seharian) dinamai dari keadaan
pemakainya, bukan dari disiplin olahraga — itu yang bikin orang menemukan latihan yang
tidak akan pernah mereka cari sendiri. Episodenya diberi nama sesi, bukan minggu, karena
isinya bisa diambil acak, bukan progresi mingguan.
