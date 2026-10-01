# Laporan — Publish video oleh Coach & Dokter, dan "langsung bisa di-play"

Status: **investigasi saja. Belum ada kode yang diubah, belum ada SQL yang dijalankan.**
Semua angka di bawah diambil langsung dari database produksi `cpvzwqptzcxnwzfzgrmt`
("20FIT ALL DATA") dan dari bundel `Workout 20FIT (1).html` pada commit `fde082b`,
tanggal 1 Oktober 2026.

SQL rancangan ada di berkas terpisah dan **tidak** dijalankan:
`supabase/draft-not-applied/role_rls_storage.sql`.

---

## 6. Temuan

### 3a. Bentuk video yang sekarang sudah "di-embed"

**Semua video yang tampil hari ini adalah YouTube embed. Nol file upload.**

| sumber | jumlah | YouTube | file di Storage | kosong |
|---|---:|---:|---:|---:|
| Sesi — `w20fit_workout_cms.data->workouts[].video` | 203 | **203** | 0 | 0 |
| Episode — `...->series[].episodes[].video` | 616 | **616** | 0 | 0 |
| Gerakan — `public.w20fit_exercises.video_url` | 498 | **498** | 0 | 0 |

Pemutarannya: `_ytId()` menarik id 11 karakter dari URL, lalu dirender sebagai
`<iframe src="https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&playsinline=1">`.
Tidak ada video yang di-hardcode di kode (seed di bundel tidak lagi menempel ke store —
lihat `CLAUDE.md` bagian "Konten katalog").

**Jalur upload file sudah ada, tapi belum terpakai:**

- `_exUpload(file, kind)` di `Workout 20FIT (1).html` —
  `POST {sbBase}/storage/v1/object/w20fit-exercises/ex/<base36>-<rand>.<ext>`,
  header `Authorization: Bearer <JWT user, fallback anon key>`, `x-upsert: true`.
  Hasilnya URL publik langsung ditulis ke `exDraft.video_url`.
- **Hanya ada di form Gerakan.** Form Sesi dan form Episode cuma menerima tempelan link.
- Bucket `w20fit-exercises`: **public**, batas **100 MB/file**, mime diizinkan
  `video/mp4, video/webm, video/quicktime, image/jpeg, image/png, image/webp`.
- Isi bucket sekarang: **2 objek**, `ex/mup4ubq3-0aao2h.mp4` dan `ex/mup4zjpt-tlsfra.mp4`,
  masing-masing 1,67 MB, `video/mp4`, di-upload **1 Okt 2026 06:07 dan 06:11** oleh
  uid `7faf3e2f-…` (Stevani Lay, admin). **Keduanya belum dirujuk satu baris pun** —
  sudah jadi objek yatim.

**Pemutar untuk file** sudah ada juga: `<video src controls playsinline>` di 4 tempat,
dipilih lewat `_vidInfo(u)` → `isFile = ada URL && bukan YouTube`. Jadi begitu `video_url`
berisi mp4 dari Storage, yang dipakai `<video>`, bukan iframe. Tapi keempatnya **tanpa
`poster`, tanpa `preload`, tanpa `<source type>`, tanpa penanganan error** — lihat Bagian 4.

Jadi pembedaannya: **video embed = YouTube (semua konten yang ada sekarang)**,
**video upload = file mp4 di bucket `w20fit-exercises` (jalurnya hidup, isinya masih nol)**.

### 3b. Role Coach & Dokter

Sumber peran: tabel `public.w20fit_staff(user_id, role)` dengan
`check (role in ('admin','coach','dokter'))`, dibaca lewat fungsi SECURITY DEFINER
`public.w20fit_my_role()`.
Berkas: `supabase/migrations/20260908050000_w20fit_exercises_stage1.sql`.
App memanggilnya di `_loadStaffRole()` → `POST /rest/v1/rpc/w20fit_my_role`.

**Isi tabel hari ini:**

| role | nama | email |
|---|---|---|
| admin | Zidni | zidni@20fit.id |
| admin | Stevani Lay | stevanilay8@gmail.com |
| admin | Marketing 20FIT | marketing@20fit.id |
| admin | Super Admin 20FIT | superadmin@20fit.id |
| coach | **Coach/Dokter 20FIT (shared)** | admin1@gmail.com |

Dua hal penting di sini:

1. **Tidak ada satu pun baris `dokter`.** Role-nya ada di constraint dan di fungsi
   `w20fit_can_edit_exercises()` (`supabase/migrations/20260908093000_w20fit_exercises_editable_by_dokter.sql`
   membukanya untuk `admin`, `coach`, `dokter`) — tapi belum ada orangnya.
2. **Coach dan Dokter sekarang satu akun bersama.** Selama satu login dipakai berdua,
   RLS berbasis pemilik (`owner_id = auth.uid()`) tidak ada artinya: dua orang menghasilkan
   `auth.uid()` yang sama.

Mereka masuk lewat **CMS yang sama** (`/cms`), tidak ada halaman terpisah. Nav CMS
(`_cmsNavBase`) menampilkan ketiga tab — **Gerakan, Program, Kategori Olahraga — sama untuk
semua peran**. Yang dicek cuma "staff atau bukan" (`cmsDenied` kalau role bukan
admin/coach/dokter); **tidak ada penyaringan per-peran sama sekali di UI.**

### 3c. Apakah video Coach/Dokter masuk ke tabel yang sama dengan admin

**Tidak. Ada dua sumber yang sangat berbeda, dan ini inti persoalannya.**

| | Gerakan | Sesi / Program / Episode / Koleksi / Kategori |
|---|---|---|
| tempat | `public.w20fit_exercises` | `public.w20fit_workout_cms`, **satu baris `id='default'`** |
| bentuk | satu baris per gerakan (498) | **satu kolom `jsonb data` berisi seluruh katalog, 3,4 MB** |
| ditulis pakai | **JWT user** (`_userHeaders`) | **anon key** (`_sbHeaders`), upsert seluruh blob |
| RLS | nyata: select `status='terbit' OR w20fit_can_edit_exercises()`; write `w20fit_can_edit_exercises()` | `SELECT/INSERT/UPDATE` untuk `anon, authenticated` dengan **`using true` / `with check true`** |
| kolom pemilik | **tidak ada** | tidak ada (dan tidak bisa ada) |

Tiga akibat yang perlu diputuskan sebelum menulis kode:

1. **Lubang keamanan serius.** Anon key ikut terkirim di dalam bundel publik
   (`_sbKey()` di `Workout 20FIT (1).html`), dan policy `w20fit_cms_insert` /
   `w20fit_cms_update` menerima `anon` dengan `with check true`. Artinya **siapa pun di
   internet yang membuka halamannya bisa menulis ulang seluruh katalog** — tanpa login,
   tanpa jadi staff. Gerbang staff yang ada sekarang murni di sisi klien. Ini perlu
   ditutup lebih dulu, apa pun keputusan soal peran.
2. **RLS per pemilik mustahil selama katalog masih satu blob.** Postgres bisa mengunci
   per baris, bukan per elemen di dalam satu jsonb. Selama bentuknya begini, "coach cuma
   boleh mengubah miliknya sendiri" tidak bisa ditegakkan di database.
3. **Dua editor saling menimpa.** Setiap simpan mengirim ulang seluruh 3,4 MB. Coach
   menyimpan jam 10:00:05 dengan salinan yang dia muat jam 09:00 akan **menghapus**
   semua yang admin kerjakan di antaranya. Ini sudah jadi risiko sekarang, belum nanti.

Saran arahnya: **satu sumber data berbaris** untuk video — pecah sesi dan episode dari
blob menjadi tabel sendiri dengan kolom `owner_id` dan `status`, atau (langkah lebih kecil)
jadikan `w20fit_exercises` satu-satunya tempat video yang bisa di-upload dan biarkan blob
hanya memuat katalog YouTube yang dikelola admin. Dua pilihan ini beda besar ongkosnya;
saya belum memilihkan — lihat pertanyaan di bawah.

**Realtime: nol.**

- Tidak ada satu pun tabel `w20fit_*` di publication `supabase_realtime`
  (yang terdaftar semuanya milik aplikasi lain di database bersama ini).
- Di bundel tidak ada `realtime`, `WebSocket`, `EventSource`, polling, maupun
  `visibilitychange`.
- Katalog diambil **sekali** saat start: `hydrateCms()` → `_sbLoad()`.
- Gerakan diambil **sekali** juga: `_exLoad(force)` diawali
  `if(this.state.exLoaded && !force) return;`.

Jadi hari ini, publish baru **tidak akan pernah** muncul di tab yang sudah terbuka —
bukan "ada delay", tapi memang tidak pernah, sampai halamannya di-reload.

Catatan teknis untuk nanti: Realtime Supabase memotong payload besar
(`max_record_bytes`, bawaannya 1 MB). Baris `default` yang 3,4 MB **tidak akan terkirim
utuh** lewat Realtime. Polanya harus: dengar event perubahan → lalu fetch ulang, bukan
memakai payload event.

### 3d. Siapa boleh publish apa

Yang **sudah jelas dari kode**:

- Coach dan Dokter boleh `INSERT/UPDATE/DELETE` **gerakan apa pun, milik siapa pun** —
  `w20fit_can_edit_exercises()` tidak membedakan pemilik, dan tidak ada kolom pemilik.
- **Tidak ada approval.** `exSave` mengirim `status:'terbit'` secara keras setiap simpan.
- Gerbang tampil di user web **bukan** `status`, tapi **`video_verified`** — centang manual
  di CMS. `_homeExAll` dan `_puAll` menyaring
  `video_verified === true && video_url != ''`. Jadi "publish" yang sebenarnya = mencentang
  Verified, dan itu bisa dilakukan coach/dokter sendiri.
- Untuk katalog sesi/program: **tidak ada pemeriksaan peran sama sekali** (lihat 3c).

Yang **tidak ada di kode** dan saya tidak mau karang — saya tanyakan di akhir pesan:
apakah Coach/Dokter boleh terbit langsung atau harus lewat approval admin, apakah mereka
boleh menyentuh katalog sesi/program atau hanya Gerakan, dan apakah Coach & Dokter akan
dipisah jadi akun masing-masing.

---

## Bagian 4 — audit "langsung bisa di-play"

Semua baris di bawah berlaku untuk **video upload** (jalur `<video>`). Video YouTube
tidak kena masalah ini — itu ditangani pemutar YouTube.

| # | masalah | dampak | fix |
|---|---|---|---|
| 1 | **Codec tidak divalidasi.** Bucket mengizinkan `video/quicktime`; `_exUpload` mengirim file apa adanya tanpa cek. iPhone merekam `.mov` HEVC/H.265 secara bawaan. | Chrome desktop & Chrome Android **tidak bisa memutar HEVC** → layar hitam, tidak ada pesan. Safari/iOS jalan, jadi yang upload mengira beres. | Tolak di klien kecuali MP4/WebM; cek `video/mp4` + probe `canPlayType`. Jangka menengah: transcode ke **H.264 + AAC**. Buang `video/quicktime` dari `allowed_mime_types`. |
| 2 | **Faststart tidak dijamin.** File di-PUT mentah, tidak ada pemrosesan apa pun. | MP4 yang `moov` atom-nya di belakang harus diunduh habis sebelum frame pertama muncul. Di 4G ini jadi beberapa detik layar hitam. | Transcode dengan `-movflags +faststart`. Kalau belum ada transcode: cek `moov` di klien sebelum upload dan tolak, atau remux di klien. |
| 3 | **Batas ukuran 100 MB, tanpa batas di klien.** | Durasi gerakan: median **30 detik**, maksimum **60 detik** (dari 21 baris yang mengisi `durasi_detik`). Klip 30 detik yang sehat 2–6 MB; 100 MB berarti 1 menit video 4K mentah bisa lolos dan butuh menit-menitan untuk dimuat. | Turunkan batas bucket ke **25 MB**, dan tolak di klien di atas ~15 MB sebelum upload. **HLS tidak perlu** untuk klip 30 detik — itu kompleksitas tanpa hasil. Sesi & episode yang panjang tetap di YouTube. |
| 4 | **Bucket public.** | Tidak ada masalah signed-URL expiry — URL-nya permanen, video tidak akan mati di tengah. Tapi konsekuensinya: **siapa pun yang punya URL bisa menonton tanpa login.** Padahal konten sesi dikunci di app (lihat tirai `r.locked`). | Keputusan produk: kalau video gerakan memang bebas, biarkan public (paling cepat dan paling andal). Kalau harus terkunci, pindah ke bucket private + signed URL **dengan masa berlaku lebih panjang dari video terpanjang** (mis. 4 jam) dan perbarui saat `loadedmetadata` gagal. |
| 5 | **Range request & CORS.** | Supabase Storage sudah melayani `Range` dan mengirim `Accept-Ranges: bytes`, CORS terbuka. Geser timeline **jalan**, tidak mengunduh ulang dari awal. | Tidak ada yang perlu diperbaiki sekarang. Jadi masalah kalau nanti dipasang CDN sendiri atau proxy — uji ulang seeking saat itu. |
| 6 | **Tidak ada poster.** Keempat `<video>` tidak punya atribut `poster`. Untuk YouTube ada thumbnail otomatis (`img.youtube.com/vi/<id>/hqdefault.jpg`); untuk file, `_puThumb` mengembalikan string kosong kalau `thumbnail_url` kosong. | Kotak hitam sampai frame pertama termuat. | Wajibkan thumbnail saat upload video file, atau ambil frame pertama di klien (`canvas.drawImage` dari `<video>` yang di-seek ke 0,1 dtk) dan upload sebagai poster. Pasang `poster={thumbnail_url}`. |
| 7 | **`preload` tidak di-set.** | Default sebagian browser `auto` → daftar gerakan bisa menarik banyak byte sekaligus di HP. | `preload="metadata"` untuk kartu di daftar; `preload="auto"` hanya untuk video yang sedang dibuka. |
| 8 | **Tidak ada status "processing".** `exSave` mengirim `status:'terbit'` setiap simpan; satu-satunya rem adalah centang `video_verified`. | Begitu transcode dipasang, video akan tampil "terbit" padahal filenya belum siap → user menekan play dan dapat error. | Tambah kolom status media terpisah: `draft → processing → ready → published`. User web hanya menampilkan `published` **dan** `ready`. |
| 9 | **Tidak ada penanganan error di `<video>`.** Pemutar YouTube versi React punya `onError` (`this.setState({videoError:true})`); keempat `<video>` tidak punya apa-apa. | Video gagal (codec salah, file terhapus, jaringan putus) → kotak hitam tanpa penjelasan, tanpa tombol coba lagi. | Pasang `onError` → tampilkan pesan + tombol "Coba lagi"; satu pesan yang sama di seluruh app, seperti tirai konten terkunci. |
| 10 | **`_exUpload` jatuh ke anon key kalau sesi hilang.** `var t = (this.__sb && this.__sb.access_token) || this._sbKey();` | Upload ditolak 403 oleh storage policy (anon bukan staff), dan pesannya cuma "Upload video gagal". Editor mengira filenya yang bermasalah. | Kalau tidak ada `access_token`, jangan upload — minta login ulang dengan pesan yang jelas. |
| 11 | **Objek yatim tidak dibersihkan.** Dua mp4 hari ini sudah menumpuk tanpa dirujuk. | Tagihan storage naik diam-diam; tidak ada cara tahu mana yang terpakai. | Simpan `storage_path` di baris gerakan (bukan hanya URL penuh), dan hapus objek lama saat video diganti atau gerakan dihapus. |

---

## 7. Rekomendasi pipeline video

Konteks yang menentukan: **klipnya pendek** (median 30 detik, maksimum 60), **volumenya
kecil** (498 gerakan, sebagian besar sudah YouTube), dan **video panjang tetap di YouTube**.
Itu membuat pipeline berat tidak sepadan.

| arah | cara | biaya | tradeoff |
|---|---|---|---|
| **A. Validasi ketat di klien saja** | Tolak non-MP4/H.264, batasi 15 MB & 90 detik, ambil poster dari frame pertama, minta re-export kalau tidak lolos | **Rp 0** | Paling cepat dipasang (sehari). Beban pindah ke editor: kalau dia merekam dari iPhone, dia harus ekspor ulang. Tidak menjamin faststart. |
| **B. Transcode di klien** (`ffmpeg.wasm` / WebCodecs) | Konversi di browser sebelum upload | Rp 0 | Berat di HP (klip 60 dtk bisa 1–3 menit di ponsel kelas menengah), `ffmpeg.wasm` ~25 MB unduhan, dukungan Safari iOS tidak merata. Tidak saya sarankan untuk editor yang kerja dari HP. |
| **C. Worker sendiri di Railway + ffmpeg** | Upload → tabel antrean → worker tarik, transcode H.264+AAC 720p `-movflags +faststart`, buat poster, tulis balik `ready` | **± $5/bln** (sudah ada akun Railway untuk hosting app ini) | Kontrol penuh, hasil konsisten, biaya rata. Perlu ditulis dan dijaga sendiri (± 2–3 hari kerja), plus penanganan gagal/retry. |
| **D. Layanan luar** (Mux / Cloudflare Stream / api.video) | Upload langsung ke mereka, simpan playback id | Mux ± $0,03/menit encoding + delivery; Cloudflare Stream $5 per 1.000 menit tersimpan + $1 per 1.000 menit ditonton | Paling benar sejak hari pertama (faststart, HLS, poster, analytics). Untuk 500 klip × 30 dtk = 250 menit → Cloudflare ± $1,25/bln penyimpanan. Tambah satu vendor dan satu kunci rahasia lagi. |

**Saran saya: A sekarang, C kalau upload benar-benar jadi jalur utama.**
Validasi klien menutup 80% rasa sakit (nomor 1, 3, 6, 7, 9 di tabel audit) dalam sehari
dan tanpa biaya. Worker transcode baru sepadan kalau coach/dokter benar-benar akan
meng-upload rutin dari HP — dan kalau sampai di situ, Cloudflare Stream (D) layak
dibandingkan serius dengan C, karena $1–5/bln sering lebih murah daripada waktu
memelihara worker sendiri.

**HLS: tidak untuk sekarang.** Untuk klip 30 detik, HLS menambah latency awal dan
kerumitan tanpa manfaat. HLS baru masuk akal kalau nanti ada video > 10 menit yang
di-host sendiri — dan itu belum ada rencananya karena sesi panjang memakai YouTube.

---

## 8. SQL

Ada di `supabase/draft-not-applied/role_rls_storage.sql`.
Folder sengaja **bukan** `supabase/migrations/` supaya `supabase db push` tidak
menjalankannya tanpa sengaja. Isinya: baris dokter, kolom pemilik + backfill, RLS per
pemilik, penutupan lubang `w20fit_workout_cms`, storage policy per folder uploader, dan
pendaftaran Realtime. **Belum dijalankan.**

---

## 9. Skenario tes

Prasyarat: Coach dan Dokter punya **akun masing-masing** di `w20fit_staff`
(hari ini masih satu akun bersama — tanpa ini tes kepemilikan tidak membuktikan apa pun).

**T1 — Coach, MP4 normal**
1. Masuk CMS sebagai akun Coach → Gerakan → Tambah.
2. Upload MP4 H.264 ± 5 MB, isi nama + thumbnail, centang Verified, simpan.
3. Di **tab user web yang sudah terbuka sejak sebelum langkah 2** (Chrome desktop):
   gerakan baru muncul **tanpa reload**, dalam < 3 detik.
4. Klik → video jalan < 1 detik, poster tampil sebelum frame pertama, geser timeline jalan.

**T2 — Dokter, .mov dari iPhone**
1. Masuk CMS sebagai akun Dokter, upload `.mov` langsung dari iPhone (HEVC).
2. **Harapan setelah perbaikan:** ditolak di klien dengan pesan yang menyebut format dan
   cara memperbaikinya — **bukan** ter-upload lalu gagal diputar diam-diam.
3. Kalau pipeline transcode dipasang: statusnya `processing`, **tidak** tampil di user web,
   lalu berubah `ready` dan muncul sendiri tanpa reload.

**T3 — benar-benar bisa diputar, tiga browser**
Untuk video dari T1, buka di **Chrome desktop, Safari iOS, Chrome Android**:
play jalan, audio ada, seeking jalan, tidak ada layar hitam. (Safari iOS adalah yang
paling sering lolos padahal yang lain gagal — jangan tes di situ saja.)

**T4 — batas kepemilikan**
1. Coach mencoba mengubah gerakan milik Dokter → **ditolak** (403 dari RLS, bukan hanya
   tombol disembunyikan).
2. Admin mengubah gerakan milik siapa pun → berhasil.
3. Akun member biasa memanggil endpoint insert gerakan langsung → ditolak.

**T5 — lubang anon (regresi keamanan)**
Dengan anon key dari bundel, `PATCH w20fit_workout_cms?id=eq.default` tanpa login
→ **harus ditolak**. Hari ini berhasil.

**T6 — dua editor bersamaan**
Coach dan admin membuka CMS bersamaan, masing-masing menyimpan satu perubahan berbeda
→ keduanya bertahan. Hari ini yang belakangan menimpa seluruhnya.

**T7 — tab lama**
Biarkan tab user web terbuka 30 menit, lalu publish dari CMS → tetap muncul tanpa reload
(menguji bahwa koneksi Realtime bertahan / tersambung ulang, bukan cuma jalan di menit pertama).
