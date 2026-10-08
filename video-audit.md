# Audit Video — Channel per Program + Ketersediaan (oEmbed)

Metode: **YouTube oEmbed** (publik, tanpa API key, tanpa kuota), dijalankan lewat `pg_net` dari database. Read-only: tidak ada konten/blob/web user yang diubah. Hasil per video disimpan di tabel `w20fit_video_status`.

## Ringkasan

- **1.404 video unik** dicek (1.541 referensi di 4 sumber: 616 episode, 224 sesi, 203 workout blob, 498 gerakan).
- **1.401 OK**, **3 tidak bisa diputar** (oEmbed 401/404 → private/members/dihapus).
- **44 program** (series), **0 konsisten 1 channel**. **193 channel berbeda** dipakai di program.
- Sebaran: **1 channel:** 0 · **2:** 1 · **3:** 2 · **4+ channel:** 41.

> Artinya: semua program saat ini masih 'playlist campur' banyak kreator. Target 1 program = 1 channel adalah pekerjaan kurasi ulang (nanti dipermudah lewat import playlist).

## Video tidak bisa ditonton user (prioritas ganti)

| Program | Week·Day | Episode | video_id | Masalah |
|---|---|---|---|---|
| Evening Wind-Down | W1·D6 | Evening Wind-Down — Day 6 | `7H0FKzeuVVs` | 401 (private/members/embed mati) |
| Full Marathon | W1·D4 | Full Marathon — Day 4 | `BboSkVBed40` | 404 (dihapus) |
| HYROX Sled & Carry | W2·D1 | HYROX Sled & Carry — Day 1 | `QZ3f6PspFD8` | 401 (private/members/embed mati) |

## Konsistensi channel per program (urut paling campur)

| Program | Episode | #Channel | Channel dominan | Ep dari dominan | Beda channel |
|---|---|---|---|---|---|
| Hip Opener | 14 | 13 | BrettLarkinYoga | 2 | 12 |
| HYROX Foundations | 14 | 13 | PureGym | 2 | 12 |
| Breath & Calm | 14 | 12 | Hands-On Meditation | 2 | 12 |
| Desk Reset | 14 | 12 | EDR Fitness | 2 | 12 |
| HYROX Simulation | 14 | 12 | Rich Ryan | 3 | 11 |
| Neck & Shoulder Release | 14 | 12 | SarahBethYoga | 2 | 12 |
| Strong Healthy Knees | 14 | 12 | AskDoctorJo | 3 | 11 |
| Full-Body Stretch | 14 | 11 | Move With Nicole | 3 | 11 |
| HYROX Sled & Carry | 14 | 11 | Tiago Lousa | 2 | 12 |
| Posture Reset | 14 | 11 | Dr. Jon Saunders | 3 | 11 |
| Start Without Jumping | 14 | 11 | HASfit | 2 | 12 |
| Total Flexibility | 14 | 11 | Tom Merrick | 4 | 10 |
| Balance & Stability | 14 | 10 | SilverSneakers | 3 | 11 |
| HYROX Engine | 14 | 10 | RowAlong – Follow Along Rowing Machine Workouts | 4 | 10 |
| Back Mobility | 14 | 9 | mobility by julia reppel | 5 | 9 |
| Dance Cardio | 14 | 9 | growingannanas | 3 | 11 |
| Easy Home Cardio | 14 | 9 | growingannanas | 4 | 10 |
| Evening Wind-Down | 14 | 9 | mobility by julia reppel | 3 | 11 |
| Gentle Recovery | 14 | 9 | mobility by julia reppel | 4 | 10 |
| Hip Mobility | 14 | 9 | Tom Merrick | 4 | 10 |
| Joint-Friendly Strength | 14 | 9 | Caroline Jordan | 4 | 10 |
| Power Yoga | 14 | 9 | Boho Beautiful Yoga | 3 | 11 |
| Restorative Yoga | 14 | 9 | Charlie Follows | 3 | 11 |
| Sculpt & Tone | 14 | 9 | MadFit | 3 | 11 |
| Strength & HIIT | 14 | 9 | Sydney Cummings Houdyshell | 5 | 9 |
| Total-Body Strength | 14 | 9 | Caroline Girvan | 3 | 11 |
| Easy Everyday | 14 | 8 | SeniorShape Fitness | 5 | 9 |
| Low-Impact HIIT | 14 | 8 | MadFit | 6 | 8 |
| Lower Back Relief | 14 | 8 | Tone and Tighten | 6 | 8 |
| Lower-Body Strength | 14 | 8 | Tom Peto Training | 3 | 11 |
| No-Equipment Cardio | 14 | 8 | growingannanas | 3 | 11 |
| Ease Stress | 14 | 7 | SarahBethYoga | 5 | 9 |
| Guided Meditation | 14 | 7 | Goodful | 4 | 10 |
| HIIT Burn | 14 | 7 | MadFit | 4 | 10 |
| Morning Yoga Flow | 14 | 7 | Jess Yoga | 4 | 10 |
| Upper-Body Strength | 14 | 7 | Caroline Girvan | 4 | 10 |
| Morning Mobility | 14 | 6 | mobility by julia reppel | 4 | 10 |
| Core Pilates | 14 | 5 | Move With Nicole | 7 | 7 |
| Intense Tabata | 14 | 5 | growingannanas | 4 | 10 |
| Couch to 5K | 14 | 4 | IBX Running | 11 | 3 |
| Half Marathon | 14 | 4 | IBX Running | 11 | 3 |
| Build to 10K | 14 | 3 | IBX Running | 11 | 3 |
| Strong Core | 14 | 3 | MadFit | 6 | 8 |
| Full Marathon | 14 | 2 | IBX Running | 12 | 2 |

## Channel terbanyak (kandidat kreator untuk didekati)

| Channel | Link | Episode | #Program |
|---|---|---|---|
| IBX Running | https://www.youtube.com/@IBXRunning | 45 | 4 |
| MadFit | https://www.youtube.com/@MadFit | 30 | 12 |
| mobility by julia reppel | https://www.youtube.com/@julia.reppel | 23 | 11 |
| Heather Robertson | https://www.youtube.com/@Heatherrobertsoncom | 21 | 11 |
| growingannanas | https://www.youtube.com/@growingannanas | 20 | 9 |
| Tom Merrick | https://www.youtube.com/@BodyweightWarrior | 17 | 7 |
| Yoga With Adriene | https://www.youtube.com/@yogawithadriene | 17 | 10 |
| Caroline Girvan | https://www.youtube.com/@CarolineGirvan | 17 | 6 |
| Sydney Cummings Houdyshell | https://www.youtube.com/@sydneycummingshoudyshell | 15 | 7 |
| Yoga with Kassandra | https://www.youtube.com/@yogawithkassandra | 14 | 7 |
| Juice & Toya | https://www.youtube.com/@JuiceandToya | 13 | 10 |
| Move With Nicole | https://www.youtube.com/@MoveWithNicole | 12 | 3 |
| nourishmovelove | https://www.youtube.com/@nourishmovelove | 11 | 8 |
| HASfit | https://www.youtube.com/@HASfit | 11 | 7 |
| Tone and Tighten | https://www.youtube.com/@toneandtighten | 10 | 4 |
| SeniorShape Fitness | https://www.youtube.com/@SeniorShapeFitness | 10 | 5 |
| SarahBethYoga | https://www.youtube.com/@sarahbethyoga | 10 | 4 |
| fitbymik | https://www.youtube.com/@fitbymik | 9 | 6 |
| Jess Yoga | https://www.youtube.com/@JessicaRichburg | 8 | 5 |
| EDR Fitness | https://www.youtube.com/@edrfitness | 7 | 4 |
| Charlie Follows | https://www.youtube.com/@CharlieFollows | 7 | 5 |
| Yoga With Tim | https://www.youtube.com/@yogawithtim | 7 | 4 |
| Sunny Health & Fitness | https://www.youtube.com/@SunnyHealthFitness | 6 | 3 |
| Tom Peto Training | https://www.youtube.com/@TomPetoTraining | 6 | 4 |
| PS Fit  | https://www.youtube.com/@PS_Fit | 6 | 2 |

_Total 193 channel unik. Daftar lengkap di `video-audit-channels.csv`._

## Lampiran / file

- `video-audit-episodes.csv` — 616 episode: program, week/day, judul, video_id, channel, link channel, playable.
- `video-audit-programs.csv` — 44 program: #channel, dominan, beda-channel, unplayable.
- `video-audit-channels.csv` — 193 channel: episode & #program.
- Tabel DB `w20fit_video_status` — status per video (reusable).

## Catatan metode

- Channel dibandingkan via `author_url` oEmbed (mis. `youtube.com/@yogawithadriene`), konsisten per kanal.
- oEmbed gagal (401/404) = sinyal video tak-bisa-diputar (private/members/dihapus/embed mati). Bukan deteksi members-only resmi, tapi menangkap kasus nyata tanpa API.
- Sesi kategori (224), workout blob (203), gerakan (498) **tidak** kena aturan 1-channel; statusnya tetap tersimpan di `w20fit_video_status` untuk nanti.