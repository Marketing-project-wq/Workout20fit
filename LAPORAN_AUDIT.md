# LAPORAN AUDIT VIDEO SESI — 20FIT

> Audit metadata video yang sudah terpasang di tiap sesi. **Ini audit, bukan perbaikan** — tidak ada video yang diganti/dihapus di task ini.
> Tanggal: 2026-08-21. Sumber data: katalog live (`_programsSrc` + `_seedVideoMap`, commit yang sedang di-deploy).

## ⚠️ Batasan yang harus diakui (baca dulu)
- **Tidak ada `YOUTUBE_API_KEY`** di environment, dan **oEmbed diblokir** (proxy menolak `youtube.com`, HTTP 000). Endpoint YouTube Data API sebenarnya reachable, tapi tak bisa dipakai tanpa key valid.
- Karena itu, satu-satunya sumber metadata = **tool WebSearch** → hanya memberi **judul** (dan kadang deskripsi/menit-di-judul + channel-context).
- Konsekuensi yang TIDAK diakali:
  - **D5 (teknis: embeddable / privacyStatus / regionRestriction)** = `TIDAK_BISA_DICEK` untuk **seluruh 30 sesi**. Tak ada cara verifikasi apakah video benar-benar bisa di-embed / tidak diblokir region ID.
  - **D3 (durasi asli)** hanya dari **menit yang tertulis di judul** (mis. "20 Min"), **bukan** `contentDetails.duration` detik. Ditandai "~ (dari judul)".
  - **D6 (bahasa audio)** = `TIDAK_BISA_DICEK` (tak ada `defaultAudioLanguage`); judul berbahasa Inggris → audio *kemungkinan* EN, tak dikonfirmasi.
  - **Isi video tidak ditonton.** Semua verdict berbasis metadata judul, bukan isi.

## Catatan scope penting
Database live saat ini berisi **30 sesi**, **bukan ~100**. Katalog ~100 yang lama sudah **dipangkas** (110 aktivitas "extra" + 160 episode sintetis dibuang) pada task sebelumnya. Audit ini menilai **30 sesi asli** yang tersisa.

---

## 1. Ringkasan angka
| Verdict | Jumlah | % |
|---|---|---|
| ✅ LOLOS | 8 | 27% |
| 🟠 REVIEW | 21 | 70% |
| 🔴 GANTI | 0 | 0% |
| ⛔ ERROR | 1 | 3% |

**Penting soal makna "LOLOS":** LOLOS di sini HANYA berarti dimensi yang *bisa dicek dari judul* (kategori, level, durasi-menit, format) konsisten. **LOLOS TIDAK menyertifikasi**: video pasti bisa di-embed, tidak diblokir region, atau durasi detik akuratnya — itu semua tetap `TIDAK_BISA_DICEK`.

**21 dari 30 sesi (70%)** verdict-nya bergantung pada dimensi `TIDAK_BISA_DICEK` (≥3 TBC) → dasar penilaiannya **tipis**.

---

## 2. PRIORITAS 1 — Level / intensitas (keluhan utama)
**Tidak ada satu pun sesi dengan D2 = `TIDAK_COCOK`.** Kenapa? Mismatch level yang blatant (mis. video "advanced" di sesi pemula) sudah **dibereskan di task re-sourcing sebelumnya**. Yang tersisa bukan salah-tempat terang-terangan, melainkan **tidak bisa dipastikan** karena judul video tak memuat kata-sinyal level.

Yang tetap **perlu mata coach** (level implied oleh nama sesi, tapi video tak mengonfirmasi):

| Sesi | Level (nama) | Video | D2 | Kenapa perlu direview |
|---|---|---|---|---|
| HYROX Foundation | Pemula (dari "Foundation") | "40-Minute Hyrox-Inspired Workout (Full Body HIIT with Weights)" | TIDAK_BISA_DICEK | Judul tanpa kata-sinyal level; nama "Foundation"=pemula tak bisa dikonfirmasi dari metadata video (perlu review: 40mnt HIIT+beban mungkin berat utk pemula) |
| Strength Foundations | Pemula (dari "Foundations") | "30 min FULL BODY STRENGTH WORKOUT | With Dumbbells (And Without) | No Repeats" | TIDAK_BISA_DICEK | Tak ada kata-sinyal level; "(And Without)" isyaratkan bisa diskalakan tapi bukan penanda level pasti; nama "Foundations"=pemula tak terkonfirmasi |
| Pilates Mat | Pemula (Mat = dasar) | "FULL BODY PILATES AT HOME Complete Tone & Fat Burn | 20 min Workout" | TIDAK_BISA_DICEK | Tak ada sinyal level; "Complete Tone & Fat Burn" netral |
| HYROX Pemula | Pemula (eksplisit "Pemula") | "30 MINUTE HYROX TRAINING FOLLOW ALONG WORKOUT" | TIDAK_BISA_DICEK | Sesi eksplisit "Pemula" TAPI judul HYROX generik TANPA sinyal/modifikasi pemula → tak bisa dipastikan cocok utk pemula. PRIORITAS REVIEW: HYROX cenderung intens |
| Morning Yoga | Pemula (gentle morning) | "10 min Morning Yoga Flow - Intention Setting" | TIDAK_BISA_DICEK | Tak ada sinyal level eksplisit; "morning ... intention" cenderung gentle |
| Pilates for Posture | Pemula–Menengah (postur, gentle) | "20 Min. Pilates Workout for Better Posture | Daily Routine for a Strong Back & Healthy Spine" | TIDAK_BISA_DICEK | Tak ada sinyal level; "Daily Routine" netral |
| HIIT Cardio Blast | Menengah (dari "Blast") | "20 Min Fat Burning HIIT Workout - All Standing, No Jumping" | MERAGUKAN | Sesi "Blast" (menengah), tapi video "All Standing, No Jumping" = low-impact → intensitas mungkin lebih ringan dari kesan "Blast" |

**Sorotan:** `HYROX Pemula` (hx5) — sesi eksplisit untuk pemula, tapi videonya HYROX follow-along generik tanpa modifikasi pemula. HYROX secara inheren intens; ini kandidat #1 untuk dicek manual coach apakah beban/intensitasnya ramah pemula.

---

## 3. PRIORITAS 2 — Mati / tidak bisa embed / ERROR
- **D5 (teknis) = `TIDAK_BISA_DICEK` untuk SEMUA 30 sesi.** Tanpa API, status `embeddable`, `privacyStatus`, dan `regionRestriction` **tidak bisa diperiksa sama sekali**. Artinya: **belum ada jaminan** ke-30 video ini benar-benar tampil & tidak diblokir di Indonesia. Ini gap paling material dari audit ini.
- **ERROR (metadata tak bisa diambil):**
  - **Yoga for Back** (`dbWcSrKUuWU`) — ID tidak muncul di WebSearch sama sekali. Judul/isi tak bisa dikonfirmasi. Kemungkinan ID salah, video private, atau dihapus — **butuh cek via API/manual**. (Catatan jujur: video ini termasuk yang di-assign saat re-sourcing sebelumnya dan ternyata judulnya tak pernah terverifikasi.)

---

## 4. PRIORITAS 3 — Sisanya yang perlu diganti
**Tidak ada sesi berverdict `GANTI`.** Tak ada video dengan ≥2 dimensi `TIDAK_COCOK` maupun D5 teknis `TIDAK_COCOK` (D5 uncheckable, bukan gagal). Jadi dari data yang ADA, tak ada yang wajib ganti — tapi lihat Prioritas 2: status teknis semua video belum terverifikasi.

---

## 5. Video duplikat (satu ID di banyak sesi)
**Tidak ada** video ID yang dipakai >1 sesi — ke-30 video unik.

⚠️ **Tapi ada duplikasi KONTEN (ID beda, isi ~sama):**
- **HIIT Fat Burn** (`zJKtwow2oBc`) vs **HIIT Express 20** (`-hSma-BRzoo`) → judul nyaris identik: *"20 Min Fat Burning HIIT Workout - Full body Cardio, No Equipment, No Repeat(s)"*. Dua sesi berbeda praktis menyajikan latihan yang sama. Perlu diferensiasi.

---

## 6. Masalah DATA SESI (bukan masalah video)
- **Field `level` tidak ada di database.** Padahal ini keluhan utama (D2). Level di audit ini **disimpulkan dari nama sesi** (didokumentasikan per baris di CSV), bukan dari field asli. **Rekomendasi: tambahkan field `level` eksplisit** supaya audit level bisa deterministik.
- **`p6 Mobility & Recovery`**: field `jenis` di DB = **"yoga"**, padahal sesi & video-nya **mobility/recovery**. Mislabel kategori.
- **Label durasi**: semua cocok dengan menit-di-judul karena **baru disinkronkan** di task sebelumnya — jadi tak ada mismatch durasi DB vs video pada snapshot ini. (Tapi ingat: "menit-di-judul" ≠ durasi detik asli.)
- **Fokus nama vs video** (bukan salah kategori, tapi fokus meleset):
  - `hx4 HYROX Upper Body` → video "Full Body" (bukan upper body).
  - `hx3 HYROX for Runners`, `hx2 HYROX Fat Burn` → aspek "for Runners"/"Fat Burn" tak muncul literal di judul video.
  - `p4 Yoga Flow` → video "Morning Yoga" (lebih spesifik dari nama sesi).
  - `p5 Pilates Mat` → judul tak menyebut "Mat" spesifik.

---

## 7. Kategori paling bermasalah (agregat)
Tak ada `GANTI`, jadi diperingkat berdasarkan rasio **REVIEW+ERROR** (proxy "paling tak terverifikasi"):

| Kategori | Sesi | LOLOS | REVIEW | ERROR | % non-LOLOS |
|---|---|---|---|---|---|
| strength | 5 | 0 | 5 | 0 | 100% |
| hyrox | 6 | 1 | 5 | 0 | 83% |
| functional | 5 | 1 | 4 | 0 | 80% |
| pilates | 4 | 1 | 3 | 0 | 75% |
| hiit | 4 | 2 | 2 | 0 | 50% |
| yoga | 6 | 3 | 2 | 1 | 50% |

**yoga** paling bermasalah — satu-satunya `ERROR` (Yoga for Back) ada di sini, plus beberapa sesi yoga bernama-level (Restorative/Morning/Back) yang tak terkonfirmasi levelnya.

---

## 8. Yang TIDAK bisa gw pastikan (eksplisit)
| Dimensi | Status | Kenapa |
|---|---|---|
| D5 embeddable / privacy / region | `TIDAK_BISA_DICEK` × 30 | Tanpa YouTube Data API key; oEmbed diblokir |
| D3 durasi detik asli | Hanya ~menit-dari-judul × 29 | `contentDetails.duration` tak terambil |
| D6 bahasa audio (`defaultAudioLanguage`) | `TIDAK_BISA_DICEK` × 30 | Tak ada API; hanya tebakan dari bahasa judul |
| Isi/gerakan video sebenarnya | Tak terverifikasi × 30 | Video tak bisa ditonton dari environment ini |
| Judul `yg6` (Yoga for Back) | Tak terambil | ID tak muncul di WebSearch |

**Jawaban checkpoint #3:** **70%** sesi verdict-nya bergantung pada dimensi `TIDAK_BISA_DICEK` (≥3 TBC). Dasar penilaian **tipis** — audit ini kuat untuk **D1 kategori / D2 sinyal-level / D4 format** (dari judul), tapi **buta total** untuk kelayakan teknis (D5) dan isi sebenarnya.

## Rekomendasi langkah lanjut
1. **Sediakan `YOUTUBE_API_KEY`** → gw bisa cek D3/D5/D6 beneran (embeddable, region ID, durasi detik) untuk ke-30 video. Ini menutup 70% ketidakpastian.
2. **Tambah field `level`** eksplisit di DB → audit level jadi deterministik.
3. **Cek manual `yg6` (Yoga for Back)** dan **hx5 (HYROX Pemula)** duluan.
4. Perbaiki mislabel `jenis` p6, dan diferensiasi konten p8 vs ht4.
