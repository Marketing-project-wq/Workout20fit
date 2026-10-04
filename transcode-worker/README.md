# 20FIT — Worker Transcode Video

Service kecil (Node 20 + ffmpeg, tanpa dependency npm) yang mengubah video gerakan
hasil upload jadi **H.264/AAC MP4 standar web** supaya bisa diputar di semua
device (bukan cuma Safari). Dijalankan sebagai **service terpisah di Railway**,
tidak menyentuh service app utama.

## Kenapa perlu

Rekaman iPhone default = **HEVC (H.265)**. Safari bisa memutarnya, tapi
Chrome/Android **tidak** → user dapat layar hitam. Worker ini me-transcode setiap
upload ke H.264 sehingga seragam di semua pemutar.

## Alur

```
CMS (browser)
  1. upload file MENTAH  -> Supabase storage: ex/<uid>/raw/<nama>.<ext>
  2. POST <WORKER_URL>/transcode   { id, raw_path }   (Authorization: Bearer <token staff>)
Worker (Railway)
  3. validasi token staf (cms_me)
  4. unduh mentah -> ffmpeg H.264 MP4 + poster.jpg -> unggah ke ex/<uid>/<nama>.mp4
  5. PATCH w20fit_exercises: video_url=final, thumbnail_url=poster, durasi_detik, media_state='ready'
App user
  6. hanya menampilkan video saat media_state='ready'
```

## Endpoint

- `GET /health` → `{ ok, busy, queued }`
- `POST /transcode` body `{ "id": "<exerciseId>", "raw_path": "ex/<uid>/raw/<nama>.<ext>" }`
  header `Authorization: Bearer <access_token user staf>` → `202 { state:"processing" }`

## ENV (set di Railway → Variables)

| Variabel | Wajib | Contoh / default |
|---|---|---|
| `SUPABASE_URL` | ya | `https://cpvzwqptzcxnwzfzgrmt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | *(service_role key — Supabase → Settings → API)* |
| `BUCKET` | tidak | `w20fit-exercises` |
| `TABLE` | tidak | `w20fit_exercises` |
| `ALLOWED_ORIGIN` | disarankan | `https://workout.20fit.id` |
| `MAX_WIDTH` | tidak | `1280` (skala turun kalau lebih lebar) |
| `REQUIRE_STAFF` | tidak | `1` (set `0` untuk mematikan cek staf) |

> **service_role key itu rahasia penuh** (bypass RLS). Hanya boleh ada di ENV
> Railway worker ini — **jangan** pernah masuk ke bundel app/CMS (client-side).

## Setup di Railway

1. New Project / service → **Deploy from GitHub repo** → repo `Workout20fit`.
2. Service **Settings → Root Directory** = `transcode-worker`.
   (Builder otomatis pakai `Dockerfile` di folder ini — ffmpeg sudah termasuk.)
3. **Variables** → isi ENV di atas (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGIN`).
4. Deploy. Setelah hijau, catat **public URL**-nya (mis. `https://w20fit-transcode-production.up.railway.app`).
5. Cek: buka `<URL>/health` → harus `{"ok":true,...}`.
6. Kasih URL itu ke dev app — dipasang sebagai `_TRANSCODE_URL` di bundel.

## DB (dijalankan sekali)

```sql
alter table w20fit_exercises
  add column if not exists media_state text default 'ready',
  add column if not exists media_error text;
-- baris lama yang sudah ada video dianggap siap:
update w20fit_exercises set media_state='ready'
  where media_state is null and coalesce(video_url,'')<>'';
```

## Lokal (opsional)

```bash
docker build -t w20fit-worker .
docker run -p 8080:8080 \
  -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  w20fit-worker
curl localhost:8080/health
```

## Catatan ffmpeg

`libx264 high / yuv420p / +faststart / CRF 23 / veryfast`, audio AAC 128k stereo,
skala turun ke lebar maks `MAX_WIDTH`. `yuv420p` + `faststart` itu yang bikin video
jalan mulus di semua browser & mulai main sebelum selesai diunduh.
