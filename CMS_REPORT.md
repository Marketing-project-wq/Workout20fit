# Akses CMS, publish langsung, dan responsiveness — laporan

Tanggal: 1 Oktober 2026 · Commit kode: lihat `git log` branch `claude/audit-home-page-design-7w4pnk`.
Semua angka dari pembacaan read-only database produksi `cpvzwqptzcxnwzfzgrmt`.

**SQL tidak dijalankan.** Semuanya ditulis ke `supabase/pending/cms_access.sql`.

---

## 0. Satu koreksi soal stack, karena ini mengubah separuh instruksinya

Brief menyebut React + Vite dengan komponen, `memo`, `useDeferredValue`, context provider,
dan cleanup channel yang aman di StrictMode. **Repo ini bukan itu.** Aplikasinya satu
berkas bundel `Workout 20FIT (1).html` (~1,9 MB) berisi satu komponen raksasa dan mesin
template sendiri (`<script type="text/x-dc">`). Tidak ada komponen yang bisa di-`memo`,
tidak ada hook, tidak ada StrictMode, tidak ada Vite.

Jadi untuk Fase 4 saya kerjakan **padanannya**, bukan instruksinya mentah-mentah:

| yang diminta | yang dikerjakan di arsitektur ini |
|---|---|
| state lokal, bukan di parent besar | tidak mungkin — hanya ada satu komponen. Ditempuh lewat mengurangi biaya per render (lihat §4) |
| `memo` komponen list | daftar dibatasi & tidak dirender saat tertutup modal |
| `useDeferredValue` / debounce search | debounce 300 ms pada **saringannya**, bukan pada kotaknya |
| cleanup channel aman di StrictMode | `_liveStop()` di `componentWillUnmount` + penjaga sambungan ganda di `_rtConnect()` |

---

## 1. Hasil Fase 1 — penanda coach/dokter

### a. Kandidat yang ditemukan

| tabel | isi | identitas |
|---|---|---|
| `admin_users` | 25 baris, semua aktif. `role` (super_admin/admin/dokter/therapist/staff), `unit` (gym/arena/clinic/recovery), `is_doctor`, `email` | **password_hash sendiri** — sistem auth terpisah |
| `arena_coach_users` | 18 baris, semua aktif. `role` (coach/admin/gro/hc), `unit`, `email` | **username + password_hash sendiri** |
| `my20fit_doctors` | direktori dokter | `admin_user_id` → `admin_users.id`, bukan `auth.users` |
| `arena_coaches`, `gym_coaches`, `my20fit_coaches`, `my20fit_physiotherapists` | direktori tampilan (nama, foto, bio) | tidak ada identitas sama sekali |
| `staff_accounts` | 2 baris | password_hash sendiri |
| `w20fit_staff` | 5 baris | **satu-satunya yang berkunci `auth.users(id)`** |

### b. Terhubung ke `auth.users`?

**Tidak, kecuali `w20fit_staff`.** Semua penanda coach/dokter milik sistem lain punya
mekanisme sandi sendiri. Satu-satunya jembatan ke Supabase Auth adalah **email**.

### c. Unit & status aktif

Ada, dan cukup rapi: `admin_users.unit` + `is_active` + `is_doctor`;
`arena_coach_users.unit` + `is_active`. Rinciannya:

- `admin_users`: super_admin 3 · admin 9 (clinic 5, arena 2, gym 1, recovery 1) ·
  **dokter 4 (clinic)** · therapist 7 (clinic) · staff 2 (arena)
- `arena_coach_users`: coach 14 · admin 1 · gro 2 · hc 1

### d. Siapa bisa mengubahnya — dan **satu celah keamanan nyata**

- `admin_users`: RLS aktif, policy `admin_users_select_self` dengan `USING (false)` —
  klien tidak bisa membaca apa pun. Aman; hanya service role.
- `arena_coach_users`: RLS aktif, nol policy → tertutup dari klien. Aman.
- 🔴 **`shop_staff` — celah.** Policy `shop_staff_write`:
  `FOR ALL TO authenticated USING (true) WITH CHECK (true)`, dan tabelnya punya kolom
  `user_id` dan `role`. **Setiap akun yang login bisa menyisipkan baris untuk dirinya
  sendiri dengan role apa pun.** Kalau ada sistem yang memberi akses berdasarkan
  `shop_staff`, member bisa mengangkat dirinya sendiri. Bukan tabel CMS, tidak saya
  sentuh — tapi harus dibereskan pemiliknya, dan itulah sebabnya `shop_staff`
  **tidak** saya pakai sebagai sumber akses CMS.
- 🔴 **`arena_coach_users.password_plain`** — sandi mentah tersimpan di tabel. Di luar
  lingkup CMS; dilaporkan apa adanya.
- 🔴 **`w20fit_workout_cms`** masih `SELECT/INSERT/UPDATE` untuk `anon` dengan
  `using true / with check true`, sementara anon key ikut terkirim di bundel publik.
  Siapa pun di internet bisa menulis ulang katalog. SQL penutupnya ada di Bagian 5
  berkas pending (dikomentari, menunggu klien berhenti menulis pakai anon key).

### e. Berapa yang punya akun Supabase Auth

| sumber | baris | punya akun Auth **terverifikasi** |
|---|---:|---:|
| `admin_users` | 25 | **4** |
| `arena_coach_users` | 18 | **8** |
| `staff_accounts` | 2 | 1 |
| `w20fit_staff` | 5 | 5 (memang berkunci user_id) |

**Dari 4 dokter, NOL punya akun Supabase Auth.**

---

## 2. Opsi akses yang dipilih

**Bukan A, bukan email-linking murni, melainkan gabungan — dan satu bagiannya memang
belum bisa jalan.**

- **Opsi A (penanda terhubung `user_id`) tidak tersedia** untuk coach/dokter: tidak ada
  tabelnya yang menyimpan `auth.users.id`.
- **Email linking dipakai**, dengan syarat keras `email_confirmed_at is not null`. Tanpa
  itu siapa pun bisa mendaftar memakai alamat seorang coach dan mewarisi aksesnya.
- **`w20fit_staff` tetap dipakai** sebagai sumber paling tepercaya (berkunci `user_id`).
- **`cms_overrides`** untuk pengecualian, dengan blokir yang menang atas semua sumber.
- **`cms_staff` (fallback) disiapkan tapi tidak diisi** — lihat §5.

Semuanya digabung di view `cms_staff_source`, dibaca oleh `is_cms_staff()`,
`is_cms_admin()`, dan `cms_me()` (security definer, stable, `search_path` terkunci,
EXECUTE dicabut dari `anon`).

Cakupan nyata setelah SQL dijalankan: **±17 orang** (5 w20fit_staff + 4 admin_users +
8 arena_coach_users, sebelum dikurangi tumpang tindih). **Dokter: nol.**

---

## 3. Berkas yang diubah

| berkas | perubahan | alasan |
|---|---|---|
| `supabase/pending/cms_access.sql` | **baru.** Sumber akses gabungan, `cms_overrides`, `cms_staff` fallback, RLS `w20fit_exercises` per pemilik, trigger "terbit hanya kalau video ready", SQL penutup lubang anon & bucket private (dikomentari), catatan Realtime | diminta ditulis, tidak dijalankan |
| `Workout 20FIT (1).html` | gerbang CMS lewat `cms_me` dengan fallback `w20fit_my_role`; keluar otomatis saat ditolak; `_exCanEdit`/`_exPublishBlock`; tombol baris dibungkus `canEdit`; centang Verified mati sampai video ready; unggah pakai XHR + bar kemajuan + Batal; toggle optimistic + rollback + anti klik ganda; saringan pencarian ditunda 300 ms; **perbaikan bug tombol "Lihat lagi" yang kerender 60×** | Fase 3 & 4 |
| `scripts/check-cms-gate.mjs` + `package.json` | **baru.** `npm run check:cms-gate` | menjaga gerbang di 5 skenario |
| `CMS_REPORT.md` | **baru** | laporan ini |

Sudah ada dari pekerjaan sebelumnya dan tetap berlaku: Realtime + jaring pengaman
polling, validasi unggah (format/ukuran/uji-putar), poster otomatis, `preload`, tirai
gagal-putar, `npm run check:live-sync`, `check:upload-guard`, `check:typing-lag`,
`check:font-weights`.

### Bug yang saya perbaiki dari deploy saya sendiri

Tombol **"Lihat 60 lagi"** yang saya pasang di turn sebelumnya ternyata tersisip di
dalam `sc-for` baris, jadi **kerender 60 kali** — satu di setiap baris. Penyebabnya
anchor penutup `</sc-for>` yang saya ambil ternyata milik loop chip di dalam baris,
bukan loop barisnya. Sekarang dipasang dengan penghitungan tag berimbang; terverifikasi
1 tombol, node DOM 1.406 → 1.288.

---

## 4. Audit responsiveness

| komponen | masalah | fix | hasil terukur |
|---|---|---|---|
| Form gerakan (semua kolom) | 771 ms per ketukan; 12 tugas panjang sampai 831 ms | daftar 498 baris tidak dirender saat form (modal penuh layar) terbuka | **771 → 55 ms**, node 8.867 → 401, tugas panjang → nol |
| Seluruh app | `programs`/`wp` membangun ulang katalog tiap kali disentuh (48 tempat per render) | di-cache, kunci identitas `lang`/`cmsPrograms`/`cmsWorkouts` | **250 → 100 ms** |
| Daftar gerakan | 498 baris selalu di DOM | batas 60 + "Lihat lagi", reset saat saringan berubah | node 8.867 → 1.288 |
| Kotak cari gerakan | menyaring 498 baris tiap huruf | kotak tetap seketika, **saringannya** ditunda 300 ms (`exSearchQ`) | huruf tidak lagi menunggu saringan |
| Tombol Terbit / Verified | tidak ada status loading; klik ganda = dua PATCH yang saling membatalkan | `_busy(key)` per baris + update optimistic + rollback kalau server menolak | satu permintaan per klik, layar berubah <16 ms |
| Unggah video | tidak ada kemajuan, tidak bisa dibatalkan (fetch tidak punya progress unggah) | XHR + `upload.onprogress` + tombol Batal yang benar-benar `abort()` | bar kemajuan 0–100%, batal bukan dianggap error |
| Gerbang CMS | — | pengecekan selesai dulu, baru render; tidak ada kelip dasbor | terverifikasi di 5 skenario |
| Form sesi / koleksi CMS | — | diukur, sudah sehat (84 ms / 54 ms), tidak diubah | — |

**Yang dicoba dan dibatalkan:** menahan nilai ketikan 160 ms sebelum masuk state.
Angkanya membaik, tapi hurufnya hilang — begitu ada render di tengah pengetikan, isi
kotak kembali ke state yang tertinggal. Dicatat di `CLAUDE.md` supaya tidak diulang.

---

## 5. Belum bisa dikerjakan / butuh keputusan

1. **Dokter tidak bisa masuk sama sekali.** Nol dari 4 dokter punya akun Supabase Auth,
   dan aturannya "tidak ada pembuatan akun baru". Dua jalan: (a) undang 4 dokter itu ke
   Supabase Auth satu kali — `cms_staff` + template insert-nya sudah siap di berkas
   pending; (b) terima bahwa CMS dulu hanya untuk coach. **Ini keputusan produk.**
   Hal yang sama berlaku untuk ~21 orang `admin_users` dan ~10 `arena_coach_users`
   yang juga belum punya akun.

2. **Program / sesi / episode tidak bisa punya pemilik.** Semuanya hidup sebagai **satu
   baris jsonb 3,4 MB** (`w20fit_workout_cms` id='default'), bukan tabel berbaris.
   Postgres mengunci per baris, bukan per elemen jsonb — jadi "staf hanya boleh mengubah
   konten `owner_id = auth.uid()`" **hanya bisa ditegakkan untuk Gerakan**. Untuk konten
   lain yang bisa dilakukan sekarang hanya membatasi penulis ke staf CMS. Kepemilikan
   per konten butuh pemecahan blob jadi tabel (`cms_collections`/`cms_programs`/
   `cms_episodes`) — migrasi data tersendiri, belum dikerjakan.
   Efek samping yang sudah berjalan sekarang: dua editor menyimpan bersamaan =
   yang belakangan menimpa seluruhnya.

3. **RLS per pemilik untuk Gerakan akan mengunci 498 baris lama.** Semuanya hasil
   backfill ke admin pemilik modul, jadi begitu Bagian 4 berkas pending dijalankan,
   coach/dokter tidak bisa lagi menyunting katalog lama. Itu memang yang diminta brief,
   tapi di percakapan sebelumnya keputusannya "coach/dokter setara admin". **Dua
   instruksi ini bertabrakan** — berkas SQL menulis versi per-pemilik; pilih salah satu
   sebelum dijalankan.

4. **Bucket private + signed URL belum ada.** Keputusan "video harus login" sudah
   diambil, tapi `video_url` masih menyimpan URL publik permanen. Membalik
   `public = false` sekarang akan mematikan setiap video yang diunggah. Yang dibutuhkan:
   simpan `storage_path`, buat signed URL saat menonton (4 jam, diperbarui saat
   kedaluwarsa), dan tanda tangan borongan untuk poster di daftar. Belum dikerjakan.

5. **Pipeline transcode — belum dibangun, sengaja.** Brief melarang membangun infra baru
   tanpa dicatat, jadi ini catatannya. Durasi klip gerakan median 30 detik (maks 60),
   jadi **HLS tidak perlu**. Pilihan:
   - **Validasi klien saja (sekarang berjalan):** tolak non-MP4/WebM, maks 25 MB, dan
     berkasnya benar-benar dibuka di `<video>` sebelum diunggah sehingga `.mov` HEVC
     ketahuan sebelum naik. Rp 0. **Tidak menjamin faststart.**
   - **Worker ffmpeg di Railway** (sudah ada akunnya): transcode H.264+AAC 720p dengan
     `-movflags +faststart`, poster, lalu `media_state` dari `processing` → `ready`.
     ±$5/bln + 2–3 hari kerja. Kolom `media_state` dan triggernya **sudah disiapkan**
     supaya tinggal dicolok.
   - **Cloudflare Stream / Mux:** paling benar sejak hari pertama. Untuk 500 klip × 30
     dtk ≈ 250 menit → Cloudflare ±$1,25/bln penyimpanan. Menambah satu vendor.
   Saran: tetap di validasi klien sampai unggahan benar-benar jadi jalur utama, lalu
   worker Railway.

6. **Keluar otomatis saat ditolak punya efek samping.** Sesi auth di peramban itu satu
   untuk CMS dan app member. Member yang iseng membuka `/cms` akan ikut keluar dari app
   membernya. Itu yang diminta brief dan sudah diterapkan; kalau tidak diinginkan,
   gantinya cukup menampilkan layar penolakan tanpa `sbSignOut()`.

7. **Realtime belum diuji ke server Supabase sungguhan** — Supabase diblokir dari
   container ini. Yang teruji: protokolnya (payload join berisi kedua tabel, event masuk
   → UI berubah tanpa reload, sambung ulang setelah putus) dengan WebSocket di-stub,
   plus jalur polling end-to-end lewat REST di-stub.

---

## 6. Skenario tes manual

Prasyarat: `supabase/pending/cms_access.sql` sudah dijalankan (kecuali T0, yang justru
menguji keadaan sebelum itu).

**T0 — sebelum SQL dijalankan.** Buka `/cms` dengan akun di `w20fit_staff` → tetap bisa
masuk lewat jalur lama (`w20fit_my_role`). Dengan akun member → ditolak. *Tujuannya
memastikan deploy kode ini tidak mematikan CMS selama SQL belum dijalankan.*

**T1 — member ditolak.** Login akun member biasa → buka `/cms` → muncul "Akun ini tidak
punya akses ke CMS", **tidak ada kelip dasbor sedetik pun**, dan sesinya berakhir
(refresh → kembali ke layar masuk).

**T2 — member tidak bisa menulis lewat API.** Dengan token member, `POST
/rest/v1/w20fit_exercises` → **403**. Ulangi dengan anon key → 403. *Ini yang
membuktikan gerbangnya di database, bukan cuma di UI.*

**T3 — coach masuk.** Login akun coach Arena yang emailnya terverifikasi → masuk CMS,
hanya melihat tombol ubah/hapus pada gerakan miliknya sendiri. Coba PATCH gerakan milik
orang lain lewat API → 403.

**T4 — dokter.** Dengan keadaan sekarang: **tidak ada dokter yang bisa login.** Setelah
keputusan §5.1 diambil dan akunnya dibuat, ulangi T3 untuk dokter Clinic.

**T5 — unggah .mov dari iPhone.** Pilih `.mov` langsung dari iPhone → **ditolak di
klien** dengan pesan yang menyebut HEVC dan cara memperbaikinya, sebelum satu byte pun
naik. Ekspor ulang jadi MP4 H.264 → bar kemajuan jalan 0–100%, poster otomatis terisi.
Tekan **Batal** di tengah unggahan → berhenti seketika, tanpa pesan error.

**T6 — publish terkunci sampai siap.** Dengan `media_state` bukan `ready`, tombol Terbit
menolak dengan alasan. Setelah `ready` → terbit berhasil. Coba paksa lewat API
(`PATCH status=terbit` saat `media_state='processing'`) → ditolak trigger database.

**T7 — muncul tanpa refresh.** Buka User Web di tab lain **sebelum** publish. Publish
dari CMS → gerakan muncul di tab itu **tanpa reload**, < 3 detik. Lalu **unpublish** →
hilang dari tab itu, juga tanpa reload. Uji di Chrome desktop, Safari iOS, Chrome
Android. Ulangi dengan WebSocket diblokir (DevTools → block `*/realtime/*`) → tetap
muncul dalam ≤ 45 detik lewat jaring pengaman polling.

**T8 — bisa diputar, bukan cuma muncul.** Video dari T5 di tiga browser di atas: play
jalan, ada suara, geser timeline jalan, poster tampil sebelum frame pertama, tidak ada
layar hitam. Matikan jaringan di tengah → muncul tirai "Video tidak bisa dimuat. Ketuk
untuk coba lagi", dan ketukan benar-benar memuat ulang.

**T9 — klik ganda.** Klik tombol Terbit dua kali cepat → **satu** PATCH di tab Network,
status akhir benar. Matikan jaringan lalu klik → tampilan berubah sebentar lalu
**kembali** ke keadaan semula dan muncul pesan gagal.

**T10 — responsiveness.** Ketik di form gerakan → huruf muncul tanpa jeda terasa.
Ketik di kotak cari → huruf seketika, daftar menyusul ±300 ms. Buka daftar gerakan →
60 baris + tombol "Lihat 60 lagi · sisa N"; tombolnya **satu**, bukan satu per baris.
