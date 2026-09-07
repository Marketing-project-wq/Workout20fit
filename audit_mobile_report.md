# Audit Tampilan Mobile — 20FIT Workout Module

**Sifat audit:** read-only, statis. **Nol baris kode diubah.**
**Metode bukti:** kutipan kode literal + anchor `@offNNN` (seluruh app ada di **baris 379**, jadi nomor baris tidak berguna; shell luar dirujuk sebagai `L<n>`).
**Tanggal:** 2026-09-07.

> ⚠️ **Koreksi asumsi framework (Checkpoint 1).** Repo ini **BUKAN Next.js**. Ini **satu file HTML statis** (`Workout 20FIT (1).html`, ~1,36 MB) berisi SPA client-side dengan framework template custom (`sc-if`/`sc-for`), disajikan `server.js` (Node zero-dependency) di Railway. Tidak ada `.tsx`, route URL, `layout.tsx`, atau Tailwind. Karena itu seluruh item checklist yang Next-spesifik (`next/image`, `next/dynamic`, `@next/bundle-analyzer`, `sizes`, Tailwind config) berstatus **N/A**, dan sisanya diaudit terhadap arsitektur sebenarnya.

---

## 1. Ringkasan

**Total temuan: 24** (di luar catatan "sudah aman").

Per severity:
| Severity | Jumlah |
|---|---|
| P0 | 0 |
| P1 | 3 (semua klaster BUG-001) |
| P2 | 12 |
| P3 | 9 |

Per confidence:
| Confidence | Jumlah |
|---|---|
| VERIFIED | 14 |
| LIKELY | 9 |
| NEEDS_DEVICE_TEST | 1 |

**Tidak ada P0** — tidak ada temuan yang membuat konten tak terbaca atau nav tak berfungsi. Klaster paling penting adalah **BUG-001** (background/tema, P1) dan sejumlah masalah mobile klasik (viewport `100vh`, iOS input-zoom, body-scroll-lock, `playsinline`, berat font/bundel).

---

## 2. BUG-001 — Area putih/kebiruan di bagian bawah (root cause)

### Rantai layer background (`html` → konten)

| # | Layer | Lokasi | Background | Catatan |
|---|---|---|---|---|
| 1 | `html` | shell L1–2 | **TIDAK ADA** → default browser **putih** | tanpa bg, tanpa `overscroll-behavior` |
| 2 | `body` | shell **L8** | `#1D1D1F` + `display:flex; align-items:center; justify-content:center; min-height:100vh` | artefak loader bundler; **tidak** di-override app (style app hanya set `color`) |
| 3 | `div.tt-fade` | `@off21685` | **TIDAK ADA** (andalkan anak absolute); `min-height:100vh; overflow-x:hidden; position:relative; {{rootTheme}}` | var tema di-inject di sini |
| 4 | bg layer terang | `@off21839` | `linear-gradient(160deg,#EDE…)` krem, `position:absolute; inset:0; z-index:0` | mengisi kotak `.tt-fade` |
| 5 | bg layer gelap | `@off22051` | `…#111009,#0A0908`, abs `inset:0`, `opacity:{{darkBg}}` | overlay dark-mode |
| 6 | blob dekor biru | `@off22432` | `rgba(0,104,201,.10)`, `width/height:460px; bottom:-160px; left:10%` | sumber **rona kebiruan** |
| 7 | `main.tt-main` | `@off37406` | **TIDAK ADA**; `z-index:1; max-width:1120px; margin:0 auto; padding:… 100px` | kolom konten, transparan |
| 8 | `.tt-tabbar` | `@off97624` | `var(--glass-strong)` (#FFFFFF terang) + blur; pakai `env(safe-area-inset-bottom)` | satu-satunya yang pakai safe-area |

### Elemen penyumbang putih (tertunjuk)

1. **`html` tanpa background (layer 1) — akar utama.** Warna halaman **hanya** dicat 2 layer absolute di dalam `.tt-fade`. Begitu dokumen keluar dari kotak itu — **paling pasti pada overscroll/rubber-band iOS**, karena `overscroll-behavior` = **0** — yang tampil adalah **putih default `html`**.
2. **Rona "kebiruan" (layer 6).** Blob dekor `rgba(0,104,201,.10)` di kiri-bawah + surface `--glass:#FFFFFF` (putih murni) di atas halaman krem `#EDE…` → gabungan inilah yang membuat area bawah terbaca **"putih kebiruan tone beda"**, persis gejala di screenshot.
3. `body{background:#1D1D1F}` (layer 2) **abu gelap, bukan putih** → **bukan** sumber putih; tapi `display:flex; align-items:center` adalah artefak loader yang tidak seharusnya membungkus app.

### Usulan fix (level paling atas — BUKAN tambal per-komponen)

1. Cat background di **`html`/`body`** dengan token halaman (jangan hanya layer absolute di `.tt-fade`).
2. **Angkat var tema ke `:root`/`html`** — sekarang hanya di `.tt-fade` via `rootTheme` (`@off867866`) → lapisan terluar tidak pernah theme-aware.
3. Set **`overscroll-behavior:none`** + `color-scheme` sesuai tema.
4. Reset `body` shell untuk mode app: buang `background:#1D1D1F` + flex-center (itu hanya untuk state loading).

### Semua route atau hanya konten pendek?

**Semua route** — risikonya struktural (level html/body/token), bukan soal panjang konten: overscroll bounce menampilkan putih di mana saja. "Blok putih setelah *Lihat Lebih Banyak*" paling mudah direproduksi di **katalog**, tetapi **pemicu piksel persisnya = `NEEDS_DEVICE_TEST`** (butuh iPhone Safari asli).

### Pertanyaan tambahan (toggle Light/Dark desktop)

Di codebase ini state tema tunggal (`state.theme:'light'` default, `@off175513`) diterapkan **konsisten** ke subtree `.tt-fade` via `rootTheme`. **Namun** screenshot desktop-mu menampilkan **sidebar** — di **USER app tidak ada sidebar** (hanya `<main>` ter-center, `max-width:1120px`); sidebar hanya eksis di **mode CMS** (`@off98455`). Jadi screenshot desktop itu kemungkinan **surface lain (CMS / build lama)**, bukan USER app. **Tidak dipaksa jadi bug** — perlu klarifikasi URL & tes device.

---

## 3. Batasan audit (yang TIDAK bisa diverifikasi tanpa device/tool)

- **Angka performa apa pun** (FPS, jank, Lighthouse, ukuran bundel efektif, TBT) — Lighthouse/LHCI & bundle-analyzer **tidak terpasang**; Playwright **tidak di-install** (dipilih statis). Semua klaim "berat/lag" **tidak** ditulis sebagai fakta.
- **Overscroll/putih exact trigger**, **stutter scroll nyata**, **iOS fullscreen behavior**, **ukuran tap target aktual**, **CLS font-swap nyata** — hanya bisa dipastikan di HP asli (lihat §6).
- **Desktop & CMS** sengaja tidak diaudit dalam (di luar scope); hanya dicatat bila kebetulan terlihat.

---

## 4. Top 10 temuan prioritas (dengan root cause)

1. **H-01 (P1)** `html` tanpa background → putih saat overscroll/sisa. *Root:* warna halaman hanya dicat layer absolute di `.tt-fade`, bukan di `html/body`.
2. **H-04 (P1)** Var tema hanya di `.tt-fade` (via `rootTheme`), bukan `html/body` → lapisan terluar tak theme-aware, timbul seam.
3. **H-02 (P1)** `overscroll-behavior` tidak diset → rubber-band iOS memperlihatkan putih `html`.
4. **D-01 (P2)** Input global `font-size:13.5px` (<16px) → iOS auto-zoom saat fokus login. *Root:* satu style `input` dipakai semua form.
5. **C-01 (P2)** `100vh` (×4) tanpa `dvh/svh` → tinggi salah saat address bar mobile berubah.
6. **D-03 (P2)** Body tidak di-scroll-lock saat modal terbuka → background scroll di belakang modal + scroll-in-scroll (A-03).
7. **E-01 (P2)** URL embed tanpa `&playsinline=1` → iOS bisa memaksa fullscreen saat play.
8. **B-02 / F-01 (P2)** 51 `@font-face` (4 family, banyak weight) + `font-display:swap` tanpa metric-matching → reflow saat swap **dan** bundel berat. *Root:* banyak weight di-embed; `Inter` hanya dirujuk 1×.
9. **B-03 / F-03 (P2)** Tanpa skeleton + 1 file 1,36 MB harus di-parse dulu → layar kosong lalu konten pop.
10. **A-01 (P2)** Bottom nav `fixed` + `backdrop-filter:blur(22px)` permanen di atas area scroll → potensi jank di HP lemah (belum diukur).

---

## 5. Temuan per kategori

### A. Scroll Performance
- **A-01 (P2, LIKELY)** bottom tab bar fixed + blur(22px) permanen.
- **A-02 (P3, LIKELY)** 19 pemakaian `backdrop-filter` agregat.
- **A-03 (P2, LIKELY)** scroll-in-scroll di playlist modal (`max-height:220px; overflow-y:auto`) tanpa body-lock.
- ✅ **Sudah aman:** tidak ada `scroll` listener (0), tidak ada rAF-scroll, animasi `fadeUp` hanya `opacity`+`transform` (composited), katalog **paginated** (`progLimit`, `slice(0,_lim)`, +8/tap) — bukan render-all.

### B. Layout Shift (CLS)
- **B-01 (P3, LIKELY)** logo `<img>` `height:auto` tanpa tinggi eksplisit.
- **B-02 (P2, LIKELY)** 51 `@font-face` `font-display:swap` tanpa `size-adjust`/metric fallback.
- **B-03 (P2, VERIFIED)** tidak ada skeleton/placeholder.
- ✅ **Sudah aman:** `aspect-ratio` dipakai (11×); container video (`box` absolute-fill) mereserve ruang → tidak ada CLS saat iframe menggantikan thumbnail.

### C. Overflow & Layout Mobile
- **C-01 (P2, VERIFIED)** `100vh` tanpa `dvh/svh`.
- **C-02 (P3, LIKELY)** tanpa `line-clamp`/`word-break` untuk judul/URL panjang.
- **C-03 (P3, VERIFIED — aman)** blob dekor 420–460px di-clip `.tt-fade overflow-x:hidden` → tidak ada scroll horizontal.
- ℹ️ `min-width:640px` hanya pada **tabel CMS** (`@off111458`, `@off144575`) — di luar scope user-mobile.

### D. Interaksi & Touch
- **D-01 (P2, VERIFIED)** input `font-size:13.5px` → iOS zoom.
- **D-02 (P2, NEEDS_DEVICE_TEST)** tap target diduga <44px (chip/ikon).
- **D-03 (P2, VERIFIED)** body tidak di-scroll-lock saat modal.
- **D-04 (P3, VERIFIED)** 4 `<div>` clickable tanpa role/tabindex/keyboard.
- ✅ **Sudah aman:** `:hover` hanya 3× → tidak bergantung hover untuk feedback.

### E. Video Embed (YouTube)
- **E-01 (P2, LIKELY)** URL embed tanpa `&playsinline=1`.
- ✅ **Sudah aman:** `allowFullScreen:true`, `loading:'lazy'`, `onError` → fallback "Video tidak tersedia" (`@off581651`); iframe hanya dirender saat `videoPlaying` (tidak auto-load di list); aspect container ter-reserve.

### F. Loading & Aset
- **F-01 (P2, LIKELY)** 51 `@font-face` embed (Inter hanya dirujuk 1×).
- **F-02 (P3, LIKELY)** gambar tanpa `srcset`/`sizes`.
- **F-03 (P2, VERIFIED)** 1 file 1,36 MB harus di-parse sebelum render pertama; tanpa loading state.

### G. Design Token Compliance
- **G-01 (P3, LIKELY)** 278 hex hardcoded vs 696 `var(--…)`. Sebagian besar adalah gradient brand (data sah), tapi ada one-off yang bisa ditokenkan. **Catatan:** token 20FIT ada sebagai CSS custom properties inline (light+dark), **bukan** package Design System eksternal — jadi tidak ada token yang "hilang" yang perlu di-STOP-kan.

### H. Background & Konsistensi Tema
- **H-01…H-06** — lihat §2. Semua VERIFIED kecuali dampak visual H-05/H-06 (kombinasi warna).

---

## 6. Daftar tes manual di device (untuk tim QA)

- [ ] **BUG-001 exact trigger:** buka `/` (USER app) di **iPhone Safari**, tekan *Lihat Lebih Banyak* di katalog, scroll ke paling bawah + tarik overscroll → foto area putih/kebiruan; ulangi di Android Chrome.
- [ ] **iOS input-zoom (D-01):** tap field email/password di login iPhone → cek layar nge-zoom atau tidak.
- [ ] **playsinline (E-01):** play 1 episode di iPhone Safari → cek video main **inline** atau lompat **fullscreen**.
- [ ] **100vh/dvh (C-01):** buka auth screen/hero di iPhone Safari, scroll sampai address bar mengecil → cek konten kepotong atau ada gap.
- [ ] **Body scroll lock (D-03):** buka playlist modal, coba scroll → cek background ikut gerak; tutup modal → cek posisi scroll kembali.
- [ ] **Tap target (D-02):** coba tap chip filter durasi/level & tombol close dengan jempol → cek meleset atau tidak.
- [ ] **Scroll stutter (A-01/A-02):** scroll cepat 20+ kartu katalog di HP low/mid-end sambil bottom-nav blur tampil → rasakan stutter (rekam layar bila bisa).
- [ ] **Font swap CLS (B-02):** load pertama di koneksi lambat (throttle) → cek teks "loncat" saat font custom masuk.
- [ ] **Safe area (H/L):** cek di iPhone dengan notch/home-indicator → konten terakhir tidak tertutup bottom-nav; area home-indicator terwarnai.

---

## 7. Yang tidak bisa dicek (tool/akses)

- **Lighthouse / LHCI:** tidak terpasang → skor performa/akses/SEO **tidak diukur**.
- **Bundle analyzer:** N/A (bukan app bundler; 1 file HTML hand-authored). Ukuran mentah diketahui (1.425.747 byte) tapi komposisi per-modul tidak dipecah.
- **Playwright/Chromium:** Chromium ada di `/opt/pw-browsers`, tapi `node_modules`/`playwright-core` **tidak terpasang** (opsi statis dipilih). Selain itu YouTube/Supabase/`media.20fit.id` **diblokir** dari container & login tidak lolos headless → view ter-auth sulit dijangkau tanpa stub.
- **Desktop & CMS:** di luar scope; hanya dicatat sekilas (sidebar & tabel CMS `min-width:640px`).
- **File yang belum diperiksa dalam:** logika `PLAYER` (bukan episode/player), `PLAYLIST DETAIL`, sebagian `CARA KERJANYA` — hanya dilihat sekilas via pola; belum ditelusuri baris-per-baris → **belum diperiksa penuh**, bukan "sudah bagus".
