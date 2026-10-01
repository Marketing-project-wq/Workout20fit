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

## Irama vertikal halaman user (desktop)

Logo di rail dan searchbar duduk di **satu sumbu, 54px** dari atas.
`.tt-main{padding-top:32px}` dan kotak cari **dipaku `height:44px; box-sizing:border-box;
padding:0 16px`** (→ titik tengah 54), dan pembungkus logo di rail adalah pita
`height:108px; display:flex; align-items:center` — logonya dipusatkan di pita itu, **bukan**
didorong pakai padding. Kalau salah satu diubah, ubah dua-duanya: sumbunya selalu
`padding-top + 22` = `tinggi pita / 2`.

Tinggi kotak cari itu sengaja dipaku, bukan dibiarkan tumbuh dari padding. Dulu tingginya
`padding:12px 16px` + tinggi baris font; waktu font badan diganti Inter → Manrope,
metriknya beda dan kotaknya jadi 48px, sumbunya lepas 2px tanpa ada yang sadar. **Jangan
bikin ukuran yang dipakai menyejajarkan sesuatu bergantung pada metrik font.**

**Jangan pernah menghitung posisi logo dari tinggi gambarnya.** Logonya `<img>` jarak jauh
dari `media.20fit.id`, dan host itu diblokir dari container ini — waktu QA gambarnya gagal
dimuat dan tingginya kebaca 18px, padahal aslinya ~40px. Perhitungan padding yang dibuat
dari angka itu meleset 11px di production. Kalau QA menyentuh logo (atau foto apa pun dari
`media.20fit.id`), **stub requestnya dengan gambar yang benar-benar dirender** — misalnya
`route.fulfill` sebuah SVG beraspek 472x160 — jangan biarkan gambarnya gagal.

Halaman hub Latihan adalah **satu-satunya** halaman yang isinya boleh meregang: jumlah
kartunya tetap tiga. Kartunya `flex:1 1 0` dengan `min-height:172px` dan
`max-height:264px`, di dalam rantai flex `.tt-main:has(.tt-hubfill) > section > div`.
Batas 264px itu supaya di monitor tinggi kartunya tidak berubah jadi baliho; sisanya
dibagi rata lewat `justify-content:center`.

Jangan pasang aturan meregang ini di halaman lain. Halaman yang isinya banyak dan
jumlahnya berubah-ubah (daftar sesi, Gerakan, kategori) harus tetap mengalir normal —
`:has(.tt-hubfill)` yang menjaga itu. Peramban tanpa `:has()` jatuh ke tata letak lama,
tidak rusak.

## Layar masuk (login / daftar / reset)

Kartunya dipusatkan di layar lewat **`display:flex` di pembungkus + `margin:auto` di
kartunya**, bukan `align-items:center`. Bedanya baru kelihatan di layar pendek (hp 667px,
atau hp mana pun waktu keyboard naik): dengan `align-items:center` bagian atas kartu
terpotong dan tidak bisa di-scroll ke sana, dengan `margin:auto` dia jatuh rapi ke atas
dan tetap bisa di-scroll. Pembungkusnya `position:fixed; inset:0; overflow-y:auto`, jadi
padding atas/bawahnya (termasuk `env(safe-area-inset-*)`) tetap terhormat.

## Ukuran logo

Satu berkas logo, enam tempat, ukuran berbeda-beda sesuai ruangnya:

| tempat | ukuran |
|---|---|
| rail desktop | `width:132px` (di pita 108px) |
| header hp (`.tt-headlogo-img`) | `width:116px`, di bawah 380px jadi `102px` |
| layar masuk & layar sambutan | `height:48px` |
| CMS (kartu masuk, sisi kiri) | `104px` / `112px` — jangan diseret ikut app user |

Kalau logonya diperbesar lagi, cek lebar header hp di 320px: hamburger + logo + toggle
tema + toggle bahasa + avatar harus tetap muat satu baris tanpa `scrollWidth` melar.

Logo di rail **diukur bareng tulisan di bawahnya**, bukan sendirian. Pernah dinaikkan ke
150px dan langsung terasa timpang: logonya jadi benda paling besar di rail sementara nav
masih 14px. Skala rail sekarang: nav `15.5px`, label tema/bahasa `14px`, nama di kartu
profil `15.5px`, emailnya `11.5px`. Naikkan atau turunkan satu, lihat lagi yang lain.

## Kartu program

Ada **satu** bentuk kartu program di seluruh app: sampul 16/9 + lencana jumlah minggu,
judul, lalu baris `epDirection` merah (JetBrains Mono). Bentuknya dibangun sekali di
`out.pgBrowseRows[].series` dan dipakai dua kali:

- tab **Latihan → Program**, dikelompokkan per koleksi (judul koleksi + garis aksen);
- strip **Program di Beranda**, `out.homePgSeriesCards` — isinya diambil dari
  `pgBrowseRows` yang sama, **bergiliran antar koleksi** (program ke-1 tiap koleksi, lalu
  ke-2, dst) supaya semua koleksi terwakili di layar pertama, dibatasi `_homePgLimit`.

Jadi kalau kartunya mau diubah, ubah di `pgBrowseRows` saja — dua tempat itu ikut. Dulu
Beranda punya kartu koleksi sendiri (foto + pita merah + "Buka") yang tertinggal waktu tab
Latihan pindah ke bentuk baru, dan dua halaman jadi kelihatan beda.

Halaman koleksi (`view:'pg-collection'`) sekarang **tidak lagi punya pintu masuk dari
kartu** — dia dicapai lewat URL `/programs/<slug-koleksi>` dan lewat tombol kembali di
halaman program. Jangan dikira mati lalu dibuang.

## Kartu di CMS

Tiga halaman CMS memakai bentuk kartu yang sama: **sampul/warna penuh, dua lencana kecil
di atas, judul Barlow 900, baris meta JetBrains, lalu tombol utama merah selebar kartu +
sepasang tombol gelap (sembunyikan / hapus) di bawahnya.** Dipakai di kartu sesi per
kategori (`progOneCatCards`, warna dari `_typeColorOf`) dan di kartu episode dalam satu
program (`serEpWeeks[].rows`, warna dari koleksinya). Dulu episode ditulis sebagai daftar
baris — satu benda yang sama tampil dua rupa di dua halaman.

Tombol tambah selalu di **kanan**: `+ Tambah Koleksi`, `+ Tambah Program`,
`+ Tambah Episode`, `+ Tambah Sesi`. Kalau ada tombol tambah baru, taruh di kanan baris
hitungannya, jangan berdiri sendiri di kiri.

Kalau mau lihat halaman CMS lewat Playwright: `w20fit_my_role` di-stub balas `"admin"`
(`route.fulfill`), sisanya `[]`. Tanpa itu yang kerender cuma gerbang masuk staff — dan
itu juga sebabnya `/cms` di `qa-final.mjs` sesekali kebaca "blank": gerbangnya memang
hampir kosong dan kadang telat serender. Jalankan ulang sebelum mengira itu regresi.

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

## Design System 20FIT v1.0

App user mengikuti Design System 20FIT. Nilainya bukan kira-kira — ini yang terpasang:

| | terang | gelap |
|---|---|---|
| `--red` | `#E4002B` | `#FF3B57` |
| `--text` | `#1D1D1F` | `#F5F5F5` |
| `--soft` | `#6E6E73` | `#A1A1A6` |
| `--faint` | `#9A9A9E` | `#8A8A8F` |
| `--glass` | `#FFFFFF` | `#17171A` |
| `--glass-2` | `#F3EEEC` | `#1E1E21` |
| `--glass-border` | `rgba(29,29,31,.08)` | — |
| `--line` | `#E4DCDA` | — |
| `--page-bg` | `#F2E9E6` | `#0B0B0D` |

Radius kartu **22px** di semua permukaan (dulu campur 16/18/20).

Tiga huruf, semuanya sudah **di-host sendiri di dalam bundel** — tidak ada `<link>` ke
Google Fonts, jangan tambahkan lagi (host itu diblokir dari container ini):

- **Barlow Condensed** — judul display, nav, tombol, tag. Uppercase. Berat yang ada di
  bundel cuma **700 / 800 / 900**; nav & tombol 700, tag/label 800, judul 900.
- **Manrope** — teks badan. Berat 200 / 400 / 700 / 800.
- **JetBrains Mono** — angka & metrik (durasi, kalori, jumlah).

Dua jebakan yang sudah pernah kena:

1. **`<button>` tidak mewarisi `font-family`.** Sebelum ada aturan
   `button,input,select,textarea{ font-family:inherit; }`, kalimat di dalam kartu
   kerender Arial padahal sisanya Inter. Kalau bikin kontrol baru, pastikan aturan itu
   masih kena.
2. **Berat font yang tidak ter-bundel diam-diam jatuh ke sintesis peramban.** Nav rail
   pernah kerender Barlow Condensed 400 — berat yang tidak ada — karena transformer
   melewatinya. Sisir dengan script yang membandingkan `font-weight` terkomputasi dengan
   daftar berat yang benar-benar di-bundel (`npm run check:font-weights`, butuh `node server.js` jalan; di container ini:
   `PW_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs PW_CHROMIUM=/opt/pw-browsers/chromium`), jangan cuma lihat mata.

Satu butir DS yang **tidak** diambil harfiah: DS menyebut permukaan kaca 55% transparan
dengan blur 28px. Permukaan app tidak semuanya punya blur, jadi kartunya dibiarkan solid
dan cuma dibuang rona hangatnya. Kalau nanti blur dipasang menyeluruh, baru transparansinya
ikut.

## Video: sumber, unggahan, dan sinkron langsung

**Dua sumber video, jangan tertukar.**

| | Gerakan | Sesi / Episode |
|---|---|---|
| tempat | `public.w20fit_exercises`, satu baris per gerakan | `public.w20fit_workout_cms`, **satu baris `id='default'`**, seluruh katalog dalam satu jsonb 3,4 MB |
| ditulis pakai | JWT user (`_userHeaders`) — RLS berlaku | **anon key** (`_sbHeaders`) — RLS-nya `true/true` |
| bisa di-upload | ya, lewat `_exUpload` | tidak, hanya tempel link |

Blob 3,4 MB itu besar karena **foto kategori disimpan sebagai base64 di dalamnya**.
Selama bentuknya satu blob: RLS per pemilik mustahil, dan dua editor saling menimpa
(tiap simpan mengirim ulang seluruh blob). Policy aksesnya sengaja belum disentuh.

**Unggah video (`_exUpload`) punya empat pagar, semuanya ada alasannya:**

1. Tidak ada lagi jatuh ke anon key kalau sesi habis — dulu hasilnya 403 dengan pesan
   "upload gagal" yang membuat editor menyalahkan berkasnya.
2. MIME harus `video/mp4` atau `video/webm`. `video/quicktime` dibuang dari
   `allowed_mime_types` bucket juga.
3. Maksimum 25 MB (bucket ikut 25 MB). Klip gerakan median 30 detik.
4. **Berkasnya benar-benar dibuka di `<video>` sebelum diunggah** (`_exProbeVid`).
   Memeriksa MIME saja tidak cukup: `.mp4` berisi HEVC dari iPhone lolos pemeriksaan
   tipe tapi gagal diputar di Chrome. Kalau browser penguji sendiri tidak bisa H.264,
   ujinya dilewati — dia tidak berhak memvonis berkas orang.

Probe sekalian mengambil durasi dan satu frame jadi **poster otomatis**, diunggah
sebagai `<nama>-poster.jpg`. Berkas masuk ke `ex/<auth.uid()>/…` — storage policy
memakai folder itu untuk membatasi siapa boleh menghapus apa.

**Sinkron langsung.** Dulu katalog diambil tepat sekali waktu start, jadi publish baru
tidak pernah sampai ke tab yang sudah terbuka. Sekarang dua jalur, keduanya **hanya di
app user** (CMS tidak ikut — menyegarkan daftar di bawah tangan editor bisa menelan
draft):

- `_rtConnect()` — WebSocket Realtime Supabase, satu topic untuk `w20fit_exercises` dan
  `w20fit_workout_cms`. Dibuka pakai **anon key**, bukan JWT user, supaya tidak perlu
  disambung ulang tiap token di-refresh. Heartbeat 25 dtk, mundur bertahap 1-30 dtk.
- `_livePoll()` — jaring pengaman tiap 45 dtk dan saat tab kembali aktif, buat jaringan
  yang memblokir WebSocket. Yang ditarik cuma `updated_at` (plus jumlah baris dari
  `content-range`, supaya penghapusan gerakan lama ketahuan).

Event `w20fit_workout_cms` **dipakai sebagai sinyal saja, isinya diabaikan** — barisnya
3,4 MB, di atas `max_record_bytes` Realtime, jadi payloadnya tidak terkirim utuh.

Yang **belum** ada: lapisan signed URL. `video_url` masih menyimpan URL publik permanen,
jadi bucket belum bisa dijadikan private. Lihat `LAPORAN_VIDEO_ROLE.md`.

Dua penyisir: `npm run check:live-sync` dan `npm run check:upload-guard`
(butuh `node server.js` jalan; di container ini pakai `PW_MODULE` + `PW_CHROMIUM`
seperti `check:font-weights`).

## Kenapa mengetik di form CMS sempat lemot

Satu ketukan papan ketik = satu `setState` = satu render, dan **satu render berarti
mesin template menyusuri seluruh template** — CMS dan app user ada di satu berkas.
Profiler menunjuk mesin template sebagai 74-88% CPU; kode view-model kita sendiri 1%.
Jadi biayanya ditentukan oleh **berapa banyak yang ada di DOM**, bukan oleh seberapa
pintar handler-nya.

Dua hal yang dibetulkan, keduanya terukur:

1. **Getter `programs` dan `wp` di-cache.** `_mergeCatalog`/`_mergeWp` membangun ulang
   seluruh katalog gabungan setiap kali getternya disentuh — dan `this.programs`
   disentuh 38 tempat, `this.wp` 10 tempat, sebagian di dalam loop. Hasilnya disimpan
   dan dibuang hanya kalau `lang`, `cmsPrograms`, atau `cmsWorkouts` berganti
   **identitas**. Itu aman karena semua jalur yang mengubah katalog mengganti arraynya
   (map/filter/rows baru) lalu setState — **kalau nanti ada yang menyunting array di
   tempat, cache ini yang akan basi.** 250 ms → 100 ms.
2. **Daftar gerakan tidak dirender penuh.** 498 baris = 8.867 node DOM yang ikut
   dirender ulang tiap ketukan. Sekarang dibatasi 60 baris + tombol "Lihat 60 lagi",
   dan **selama form gerakan terbuka barisnya tidak dirender sama sekali** — formnya
   modal penuh layar dengan tirai blur, jadi tidak ada yang hilang dari pandangan.
   771 ms → 55 ms, node 8.867 → 401, tugas panjang 831 ms → nol.

Form CMS lain (sesi, koleksi) sudah di bawah 90 ms — tidak ada daftar 498 baris di
belakangnya. Jangan ikut diutak-atik tanpa mengukur dulu.

**Yang sudah dicoba dan GAGAL — jangan diulang:** menahan nilai ketikan ~160 ms sebelum
masuk state (debounce). Idenya benar di atas kertas, tapi hasilnya huruf-huruf hilang:
begitu render terjadi di tengah pengetikan, nilai di kotak kembali ke state yang
tertinggal. Dibatalkan. Kalau nanti mau dicoba lagi, buktikan dulu dengan
`npm run check:typing-lag` **dan** tes isi form yang memeriksa teksnya utuh sampai ke
POST — angka jeda yang bagus tidak ada artinya kalau hurufnya tidak sampai.

`npm run check:typing-lag` mengukur jeda dari event `input` sampai layar tergambar
(bukan kerja sinkronnya — biangnya memang bukan handler kita) dan gagal di atas 120 ms.

## Siapa boleh masuk CMS

Gerbangnya `_loadStaffRole()`: panggil RPC **`cms_me`** dulu, kalau PostgREST balas 404
(SQL-nya belum dijalankan) jatuh ke **`w20fit_my_role`** yang lama. Jadi deploy kode
tidak pernah mematikan CMS, dan begitu SQL-nya dijalankan jalur barunya menyala sendiri
tanpa deploy ulang. Hasilnya disimpan di state `cmsStaff` / `cmsAdmin` / `cmsUnits`,
dan `isCms` / `isStaff` / `cmsDenied` semuanya dibaca dari situ — jangan dihitung ulang
dari `staffRole` seperti dulu.

Yang ditolak **dikeluarkan sesinya** (`_cmsDenyGuard`). Sadari efeknya: sesi auth di
peramban itu satu untuk CMS dan app member, jadi member yang iseng membuka `/cms` ikut
keluar dari app membernya.

Sumber aksesnya **bukan satu tabel**. Hasil penelusuran: tidak ada satu pun tabel
coach/dokter di database bersama ini yang berkunci `auth.users` — `admin_users` dan
`arena_coach_users` punya `password_hash` sendiri. Satu-satunya jembatan adalah email,
dan hanya yang `email_confirmed_at`-nya terisi. Rinciannya di `CMS_REPORT.md`;
SQL-nya di `supabase/pending/cms_access.sql` (**belum dijalankan**).

Jangan pakai `shop_staff` sebagai sumber akses apa pun: policy `shop_staff_write`-nya
`FOR ALL TO authenticated USING (true) WITH CHECK (true)` di tabel yang punya kolom
`user_id` dan `role` — siapa pun yang login bisa mengangkat dirinya sendiri.

Kepemilikan konten: `_exCanEdit(row)` (admin semua, staf hanya `owner_id`-nya sendiri)
dan `_exPublishBlock(row)` (tidak boleh terbit tanpa video / sebelum `media_state`
`ready`). Keduanya dipakai tombol **dan** dicocokkan dengan trigger database, supaya
pesannya muncul di layar sebelum servernya yang menolak.

Penyisirnya: `npm run check:cms-gate` — 5 skenario, termasuk keadaan sebelum SQL
dijalankan, dan memastikan dasbor tidak berkelip sedetik pun sebelum pengecekan selesai.

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
