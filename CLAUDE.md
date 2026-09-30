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

Sumber kebenaran konten adalah **CMS** (Supabase `w20fit_workout_cms`, baris `default`).
Apa yang ada di sana itulah katalognya — tidak lebih, tidak kurang. Seed di bundel cuma
isi awal buat store yang masih kosong (instalasi baru); begitu store ada isinya, seed
tidak ikut campur sama sekali.

**Jangan pernah menambah konten lewat seed.** Dulu `_applyCmsLoaded` menempelkan baris
seed yang id-nya belum ada di store, dan itu bikin dua masalah: barisnya kelihatan di
CMS tapi tidak tersimpan di sana, dan kalau coach menghapusnya dia balik lagi tiap
reload (store tersimpan tanpa baris itu → load berikutnya menempelkannya lagi dari
bundel). Penempelan itu sudah dibuang. Konten baru masuk lewat CMS.

Untuk memeriksa isi store tanpa browser, pakai MCP Supabase (`execute_sql`) — Supabase
diblokir dari container ini, tapi MCP jalan lewat jalur lain.

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

## Grid kartu & tombol "Lihat lebih banyak"

Grid kartu sesi dan grid kategori olahraga pakai `repeat(auto-fill,minmax(min(100%,300px),1fr))`,
jadi jumlah kolomnya ikut lebar layar (1–3 kolom). Tombol "Lihat lebih banyak" tidak boleh
berdiri di bawah baris yang masih bolong.

Kolomnya diukur dari grid yang hidup lewat `_measureGridCols()` (elemen bertanda
`data-gridcols`, dibaca dari `gridTemplateColumns`), disimpan di state `gridCols`, dan
diperbarui saat mount, tiap `componentDidUpdate`, dan saat window di-resize.
Semua batas tampil dibulatkan ke atas ke kelipatan kolom lewat `_fullRows(n)`.

## Tampilan konten terkunci

Konten yang harus login punya **satu** tampilan di seluruh aplikasi: tirai gelap +
blur (`backdrop-filter:blur(7px)` di atas `rgba(10,9,8,.5)`), gembok putih di tengah,
kalimat `tLockCardBody`, lalu pil merah `tGateCta` bergembok. Dipakai di kartu sesi
(`r.locked`), kartu Pustaka (`x.locked`), dan baris episode program (`e.locked`).

Baris episode aslinya daftar horizontal, jadi kalau terkunci barisnya berubah jadi
strip poster: fotonya pindah ke background baris (`_photoBg(_egr,_eth)`), thumbnail
terpisah disembunyikan, teksnya `visibility:hidden`, dan tirai itu menutupi seluruh
baris. Tanpa itu tirainya cuma jadi balok abu-abu karena tidak ada foto untuk di-blur.

Catatan QA: `node server.js` membaca bundelnya sekali saat start (`readFileSync`), jadi
setelah mem-patch bundel servernya harus di-restart — kalau tidak, screenshot-nya masih
versi lama.

Kalau nanti ada permukaan terkunci baru, pakai tirai yang sama — jangan bikin varian
gembok kecil atau tautan teks merah lagi.

## Menggabung dengan `main`

`main` sering maju lewat sesi lain, dan bundelnya satu baris 1,3 MB — `git merge`
tidak akan pernah bisa menyatukannya. Caranya: ambil bundel `main` utuh
(`git checkout --theirs`), lalu pasang ulang perubahan branch ini di atasnya lewat
script Python beranchor yang **memeriksa tiap anchor muncul tepat sekali** sebelum
mengganti. Kalau anchornya hilang, berarti `main` sudah menulis ulang bagian itu —
cari binding barunya, jangan paksa.

Repo ini di-clone dangkal (shallow). Kalau `git merge` bilang *refusing to merge
unrelated histories*, jalankan `git fetch --unshallow origin` dulu.

Kalau nanti ada grid kartu baru yang punya tombol lihat-lebih-banyak, tandai divnya dengan
`data-gridcols` dan bungkus batasnya dengan `_fullRows()`.

## Bahasa

Semua teks lewat `L('id','en')`. Dua aturan: jangan ada kata Inggris yang bocor ke mode
Indonesia (dan sebaliknya), dan satu benda cuma punya satu nama di seluruh aplikasi.
Nama kategori olahraga (HYROX, Yoga, Strength, …) sengaja sama di dua bahasa.

Satu gerakan latihan namanya **Gerakan / Exercise** — di app user maupun di CMS, dan di
angka ("498 gerakan" / "498 exercises"). Dulu halaman ini bernama "Pustaka / Library"
sementara CMS menyebut isinya "gerakan"; satu benda punya dua nama. Jangan pakai lagi
kata *pustaka*, *perpustakaan*, *library*, atau *move/moves* untuk benda ini. Kata
*latihan* bukan padanannya — itu nama tab utama dan artinya sesi, bukan satu gerakan.
Di kartu hub, angkanya ditulis "498 tersedia", bukan "498 gerakan", supaya tidak
mengulang judul kartunya sendiri.

Nama koleksi program tidak boleh berbagi kata dengan nama kategori mana pun — supaya dua
baris kartu di halaman Latihan tidak terbaca sebagai benda yang sama.

Koleksi bertema situasi (mis. latihan di kamar hotel) dinamai dari keadaan pemakainya, bukan dari
disiplin olahraga — itu yang bikin orang menemukan latihan yang tidak akan pernah mereka
cari sendiri. Episodenya diberi nama sesi, bukan minggu, karena isinya bisa diambil acak,
bukan progresi mingguan.

Sebelum menambah koleksi, cek dulu isi `seedCollections`/`seedSeries` di `main` — konten
di sana bertambah lewat sesi lain, dan tema yang mau ditambahkan bisa jadi sudah ada.
