# 20FIT — Product Requirements (Data Model & Taxonomy)

> Living doc kept in sync with the bundled app (`Workout 20FIT (1).html`).
> All program/exercise names & descriptions are **representative placeholders**
> and must be reviewed by a 20FIT coach before going live, consistent with the
> in-app guidance disclaimer.

## 6.1 Home / Landing Page

Home is a **function-first onboarding funnel**, not a second catalog — a new user
should immediately understand what 20FIT is and reach a relevant workout in one or
two taps. Real browsing/filtering lives in the **Exercise** tab. Sections, in order
(goal-led funnel):

1. **Hero (compact)** — "Train hard. Recover smart." + a **one-line** studio-streaming
   subhead and a **single, real** primary CTA "Mulai Latihan" (`heroStart`): returning
   users → resume the last workout (`openPlayer`); new users → open the Exercise catalog
   (`nav('exercise')`). It is a real destination, not a scroll. The decorative ▶ play
   overlay on the hero photo was **removed** (it was a fake affordance).
2. **Stats strip** — the former stats bar, now a **thin inline strip** under the hero
   (live counts: programs, sessions, goals, locations).
3. **Resume — "Lanjutkan latihan" / new-user nudge (conditional).** If `state.history`
   is non-empty, a prominent card shows the **last workout** (from `history[0]` via
   `findWorkout`) with a one-tap re-entry to the player (`openPlayer`) — gated by
   `resumeShow`. For brand-new users the card is hidden and a **single-line orientation
   nudge** takes its place (`resumeHide`): *"Belum tau mulai dari mana? Pilih tujuanmu di
   bawah."* — a small glass strip with a red ↓ that points first-timers straight to the
   goal picker below.
4. **"Jelajahi berdasarkan Tujuan" (primary).** A standalone, **always-visible**
   full-width section: 4 **colored gradient** goal cards with a live program count,
   positioned right after the stats/nudge — the page's primary action. A card →
   **Exercise with the goal filter pre-applied** (`goFilter('tujuan', <key>)`).
5. **"Jelajahi berdasarkan Tipe" (secondary).** A **compact chip/pill row** (6 small
   flat-glass pills: icon + label + count) directly under Tujuan — deliberately
   down-weighted (smaller header in `--soft`, no big imagery) so it reads as the
   secondary lens, not a competing catalog. A chip → **Exercise with the type filter
   pre-applied** (`goFilter('jenis', <key>)`). This replaces the earlier single
   tabbed `[Tujuan | Tipe]` picker: goal and type are still two lenses on one catalog,
   but the hierarchy is now expressed by size/weight rather than a tab switch, so both
   are visible at once and Tujuan clearly dominates.
6. **Featured Programs — quick start** — 3–4 **editorial, hand-picked** cards (by
   program id, not auto from the DB — `_featIds` in `renderVals`): image, name, short
   description, duration. Dynamic CTA **"Lihat semua N program →"** opens Exercise.
   *Only coach-reviewed programs may be featured.*
7. **"Cara kerjanya"** — a single concise section of **3 numbered steps** that also
   absorbs the old "Why 20FIT" messages (home-or-gym, guided tempo, history/playlist):
   Pilih tujuan/program → Ikuti tempo terpandu → Pantau & lanjutkan. The standalone
   "Why 20FIT" and separate "How It Works" sections were merged into this one.
8. **Closing CTA — "Siap mulai?"** — a centered glass panel after Cara Kerjanya that
   re-offers the single primary action (`heroStart`: returning users resume, new users
   open the catalog), so the page ends on a decision instead of trailing off.

> Revamp intent: "function over feature" — the primary action (pick a goal → get
> relevant programs) is front-and-centre, returning users resume in one tap, and each
> block earns its place. Down from 7 stacked sections to hero+strip + conditional
> resume + 4 focused blocks.

**Tab nav placement.** Home is the default landing (not a nav destination), so the
**"Home" pill was removed** — the nav is now 3 pills (Exercise, Favorite, Playlist).
On **Home** the nav is **static, directly below the hero** (before the stats strip);
on the other tabs (Exercise/Favorite/Playlist) it stays at the top (gated by
`notHome`). To return Home, the **logo is clickable** (`goHome`). Navigation
behaviour is otherwise unchanged. Nav labels are localized (ID: Latihan / Favorit /
Playlist Latihan), and the favorite/playlist count badge shows **only when > 0** (no
empty "(0)" for new users).

**Explicitly NOT on Home** (moved to / kept in the Exercise tab): Workout History,
search bar, Exercise-Type chip filter, Goal chip filter, duration sub-filter, and
the full program list. The Exercise tab retains all of these fully functional
(gated by `isExercise`; Home content is gated by `isHome`). Inside a program the
exercise list keeps its **Level** filter; the **location (Tempat)** filter chips
and per-row location tags were **removed** — members don't choose exercises by
venue (see §8.2).

### Reusable pill + image handling

The Goal and Type pills are built by **one shared builder** (`_pill(key, color,
img, onClick)` in `renderVals`); the two rows differ only by their data array and
which filter dimension they route to. Each pill shows a **category icon + live
program count** (e.g. "12 program", derived from the catalog), and Featured cards
show a **type tag + watermark icon + duration chip**. Each pill (and each Featured
card) carries an **`img` field for a CMS-supplied photo URL**. When `img` is empty
the card renders a **designed, category-themed gradient block with icon + label**
(not a generic black icon box); when a URL is provided it renders that photo instead —
**no code change needed to add photos later**, only data (`_goalImg`, `_typeImg`,
`_featImg`). Photo shot list: see `SHOTLIST.md` and the appendix below.

## 6.2 Exercise Filter (two dimensions)

The Exercise menu filters programs on **two independent dimensions**, each on its
own labelled chip row. Users can combine one from each (e.g. `Yoga` + `Turunkan
Berat Badan`).

- **Jenis Latihan** (exercise type, single-select): `Semua, HYROX, Functional,
  Yoga, Pilates, HIIT, Strength` — 6 types.
- **Tujuan** (goal, single-select): `Semua, Turunkan Berat Badan, Bangun Otot,
  Daya Tahan, Kebugaran & Pemulihan` — 4 goals.

After a Jenis **or** a Tujuan is picked, a secondary **duration sub-filter**
appears (`Semua durasi / 20-40 menit / 40-60 menit`, derived from the durations
present in the current result set), plus a **`N PROGRAM` count label** above the
list. Both chip rows, the duration sub-filter and the count are **data-driven
and reusable** — new programs inherit the behaviour with no per-category code.

The program list is **paginated with a "Show more" control** (`progLimit`,
initially 8). Picking any Jenis / Tujuan / duration resets the visible count, so
categories that grow to dozens of programs stay scannable without a long scroll.

> **NOT YET INCLUDED (needs confirmation):** connected-cardio types — Running,
> Cycling, Rowing, Elliptical, Walking. Do not generate these as a Jenis until
> 20FIT confirms it has the relevant connected equipment.

> **Solo-only catalog (decided).** Every program is designed to be done **alone /
> individually** — there are **no partner or group programs**, and no `format`
> dimension. A previously-explored `Format` (Solo/Partner/Grup) filter was reverted.
> The one former group program, *"Group HYROX Class"*, was **adapted into a solo
> program, "HYROX Kondisi Total"** — its paired/relay movements (Partner Wall Ball,
> Team Sled Relay, Partner Sandbag Carry, …) were swapped for solo equivalents that
> keep the same `movementPattern` / muscle-group targets (e.g. Wall Ball Target
> Squat, Sled Push Interval, Sandbag Deadlift Carry). One stray paired movement in
> *HYROX Simulasi Race* (Partner Wall Ball) was likewise replaced with a solo
> Wall Ball Squat Throw. No catalog exercise now requires more than one person.
> *(Coach review still needed — the solo swaps must match the original intensity /
> safety level, not just remove the partner.)*

## 8. Data Model

### 8.1 Program

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique, `p<N>` |
| `name` | string | Display name (ID); English via translation map |
| `icon` | string | Icon key |
| `jenis` | string | **single** value — one of `hyrox, functional, yoga, pilates, hiit, strength` |
| `tujuan` | string[] | **array** — subset of `turun_bb, otot, daya_tahan, wellness` (a program may serve several goals) |
| `duration` | string | `"20-40 menit"` / `"40-60 menit"` (EN `min`) |
| `desc` | string | Short description (ID); English via translation map |
| `exercises` | via `wp[id]` | Ordered list of exercises |

> Provisional mapping note (for coach review): mobility/recovery programs are
> currently filed under `jenis: yoga` since none of the 6 types is a dedicated
> "Mobility" discipline. Revisit if a Mobility type is added.

### 8.2 Exercise

| Field | Type | Notes |
|-------|------|-------|
| `id`, `name`, `level`, `benefit`, `howTo{steps,mistakes,tips}` | — | localized via EN map |
| `equipment` | string[] | `bodyweight (Tanpa alat), dumbbell, kettlebell, matras, resistance band, sled, …` |
| `zones` | string[] | **muscle_group** — primary muscles / focus zones |
| `location` | string[] | `home` / `gym` — **internal only** (CMS/data); **not surfaced in the member UI** (the location filter chips and per-row location tags were removed — members don't pick by venue) |
| `movementPattern` | string | `squat, hinge, push, pull, core, balance, cardio, mobility` |
| `kategoriAsal` | string | Jenis where the exercise first originated |

### 8.2a Exercise demonstration videos (master library)

Movement demo videos live in a **shared master library** (`data/exercise-library.json`,
177 movements) so a video is defined **once per movement** and every program that uses
that movement resolves it **by slug** — change a video in one place, all programs update.
The library is the single source of truth; a small **video-only default** is inlined into
the bundle as `_exVideoLibSrc` (kept in step via `npm run sync:library`), and the in-app
CMS overlays coach edits.

- **Schema / invariants** (`scripts/exercise-schema.mjs`): `ExerciseVideo` =
  `{provider:'youtube', videoId, source:'owned'|'third_party_embed', attribution|null,
  startSec?, endSec?, embeddable, verifiedByCoach, lastVerifiedAt}`. Un-disableable rule:
  `third_party_embed ⇒ attribution !== null`. **`video: null` is a normal, valid state.**
- **Display gate** `isPublishable(v)`: the **video player** renders **only** when
  `embeddable === true` **and** `verifiedByCoach === true` **and** (owned, or a real
  creator + link). Seeded / unenriched / unverified videos never play.
- **Video slot on every exercise:** the exercise-detail always shows a 16:9 video slot —
  the lazy player when a publishable video exists, otherwise a neutral placeholder
  (play icon + *"Video demonstrasi belum tersedia"*). The How-to text is unaffected.
- **Player** (`_videoPlayer`, exercise-detail): **lazy** — a `hqdefault.jpg` thumbnail +
  play button first; the **youtube-nocookie.com** iframe (`rel=0`, `start`/`end`,
  `loading=lazy`, `allowfullscreen`, `referrerpolicy=strict-origin-when-cross-origin`)
  mounts only on click (bandwidth-friendly). iframe error → *"Video sedang tidak
  tersedia."*; **Cara Melakukan / Kesalahan Umum / Tips always render in full**.
- **Attribution** (`_videoAttribution`, third-party only, directly under the player,
  cannot be hidden/collapsed): *"Video oleh {creatorName} · Tonton di YouTube ↗"* +
  *"20FIT tidak berafiliasi dengan {creatorName}."* — link to the canonical watch URL
  (`target=_blank rel=noopener noreferrer`), in **secondary text colour, never brand red**.
- **Seeded data** (`scripts/seed-videos.mjs`, TUGAS 3): 9 team-supplied reference videos,
  all `third_party_embed`, `embeddable:false` + `verifiedByCoach:false` (await coach
  verify), so **nothing is user-visible yet**. `battle-rope-slam` / `devil-press` /
  `sandbag-squat-clean` have creatorName pending oEmbed enrichment; *Plank to Push-Up*
  left `video:null` as the fallback test. Backup IDs in `data/video-backups.json`.
- **Rule:** only official iframe embeds — no download/re-host of third-party video, and
  third-party frames are never used as program thumbnails or marketing assets.
- **Legal attributions page** (`nav:'legal'`, deep-linkable at **`/legal/attributions`**,
  linked from a site-wide **footer**): the required boilerplate (embed-only, creators own
  the copyright, 20FIT does not re-host/monetize/affiliate) + a **takedown contact**
  (`Marketing@20fit.id`, easily changed). The **creator list is auto-generated** from the
  library — one entry per creator of a **currently-shown** (`isPublishable`) third-party
  video, deduped and alphabetised; graceful empty state when none are live yet.

### 8.2b Exercise player — set timer (Warm-up → Work → Rest per set)

The exercise-detail "Tempo guide" timer follows the **20FIT mobile app's**
guided-set flow (confirmed from a screen capture): *Warm-up countdown → Work
(count-up) → Rest (count-down, skippable)*, repeated per set. Phases
(`state.phase`): `idle` → `pre` → `work` → `rest` → (next set `pre`) → … → `done`.

- **Start countdown before every set** (`pre`, incl. set 1): a **3-2-1
  "Bersiap"** counting down, then **auto** into Work (no skip needed — it's short).
- **Work / "Latihan" counts UP** from **00:00** (elapsed, not down to a target).
  The user decides when the set is done based on their actual reps — the target
  reps (10–12) are shown only as a **visual reference**, not a timer limit. A
  **"Lanjut"** button (**"Selesai"** on the last set) ends the phase → Rest
  (or → done if it's the last set, with no trailing rest). The ring **fills
  progressively** toward the reference work duration (`state.workDur`) as the
  count-up runs — so it visibly moves like the other phases (capped full past the
  reference; the user can still tap any time). The progress arc **steps per tick**
  (no smooth `stroke-dashoffset` transition) — it advances in discrete jumps per
  second/tempo rather than gliding.
- **Rest / "Istirahat" counts DOWN** from the per-exercise rest (e.g. 45s → 0),
  ring depletes. A **"Lewati istirahat"** button skips the remaining rest. When
  rest hits 0 **or** is skipped → **auto** into the next set's Start countdown
  (`_toNextSet`). *(A "+30 sec" extend button from the reference is intentionally
  deferred for this first version — trivial to add on request.)*
- **Done / "Selesai":** after the last set's Work → completed state; the button
  becomes **"Ulangi"**.
- **Adaptive middle metric per movement** (`_tempoFor(w)` keyed on
  `movementPattern`, reference only): `cardio`/`mobility` → **Durasi**, `balance`
  → **Tahan**, strength → **Repetisi** (10–12). **Rest** parsed per exercise into
  `state.restDur`. Stat cards read **Set · {Repetisi|Durasi|Tahan} · Istirahat**.
- **Buttons:** primary label follows the phase — **Mulai → (pre: none) → Lanjut /
  Selesai (work) → Lewati istirahat (rest) → Ulangi (done)**; a secondary **Stop**
  (resets to idle) shows during pre/work/rest. Phase labels **BERSIAP / LATIHAN /
  ISTIRAHAT / SELESAI**. Dispatch via `timerPrimary` → `startWorkout` /
  `workNext` / `skipRest`.
- **Self-explanatory for first-timers (function-first):** the card is titled
  **"Panduan Latihan"**, the Set/Repetisi/Istirahat chips are labelled as *"cuma
  patokan awal"* (just references), and a **red-accented guidance line
  (`timerHint`) always states what to do now**, quoting the exact button label:
  - idle → *"Kami pandu tiap set: aba-aba 3-2-1 → gerakan → istirahat. Tekan
    'Mulai'."*
  - work → *"Lakukan gerakanmu dengan santai, lalu tekan 'Lanjut' kalau sudah
    selesai."* (last set → *"Set terakhir! … tekan 'Selesai' …"*) — this is what
    makes the count-up phase understandable (the user, not a target time, ends it).
  - rest → *"Istirahat dulu. Nanti lanjut sendiri, atau tekan 'Lewati istirahat'."*
  - done → *"Mantap, gerakan ini selesai!"*
- **Not built (deferred):** voice/audio cues; the "+30 sec" rest-extend button.
- Config: `SETS` (default 3); rest via `state.restDur` (`_parseSecs`). Values are
  representative defaults for coach review. *(Cross-exercise PREV/NEXT navigation
  within a program is out of scope here.)*

### 8.2c Playlist Latihan — create & delete

Users build personal playlists (`state.playlists`, shape `{id, name, workoutIds}`)
from the **Playlist Latihan** tab. Each saved playlist is a row showing its **name**
and workout count.

- **Open:** tapping the row opens its detail (`openPlaylistDetail(id)`).
- **Delete:** each row carries a **red trash button** (aria-label *"Hapus
  playlist"*) beside the open area. Tapping it asks a **confirm** — *"Hapus playlist
  ini? Latihan di dalamnya juga akan terhapus."* — then removes the playlist from
  `state.playlists` and persists (`deletePlaylist(id)` → `persist()`). If the
  deleted playlist is the one currently open, the view falls back to the playlist
  list (`currentPlaylistId → null`, `view: 'playlist'`). The confirm is
  defensively wrapped so a headless/no-`window.confirm` environment still deletes.

## 8.3 Goal / Type Taxonomy

Each **Jenis** should offer **as many genuinely-distinct program variants as the
exercise library can support at low overlap** (no fixed cap; maximise quantity),
with sensible **Tujuan** combinations (not every goal forced onto every type —
e.g. HIIT → Turun BB & Daya Tahan; Strength → Bangun Otot & Daya Tahan; Yoga →
Kebugaran & Pemulihan + Turun BB + Bangun Otot). Program naming pattern:
**`[Jenis] untuk [Sub-tujuan]`** or a descriptive equivalent. A rename with no
content difference is a duplicate and is rejected.

**Program → Tujuan audit (every program re-checked one-by-one).** Each program's
`tujuan` is assigned by its *actual intent* (name + jenis + intensity), not by
discipline generics, so every goal filter returns a coherent set:
- **Turunkan Berat Badan** — high-burn / HIIT / cardio / fat-loss-named programs.
- **Bangun Otot** — strength, resistance, sculpt/toning, core-building, functional
  strength.
- **Daya Tahan** — HYROX, conditioning, stamina, endurance circuits.
- **Kebugaran & Pemulihan (wellness)** — yoga, mobility, recovery, flexibility,
  posture, mind-body / general gentle fitness. **All yoga programs carry wellness**
  (plus any specific goal, e.g. *Yoga untuk Turun BB* = Turun BB **+** wellness).

Corrections from the audit: `Home Functional (Tanpa Alat)` wellness → **Daya Tahan**
(bodyweight conditioning, not recovery); `Strength Foundations` dropped wellness →
**Bangun Otot** only; `Full Body Strength` dropped Daya Tahan → **Bangun Otot** only
(compound strength ≠ endurance); `Yoga untuk Turun Berat Badan` **+wellness**;
`Pilates Sculpt` **+Turun BB** (toning, aligns with *Core & Sculpt*). Resulting goal
coverage across the 36 programs: Bangun Otot 14 · Kebugaran & Pemulihan 14 · Daya
Tahan 12 · Turunkan Berat Badan 11. (`tags` is legacy/unused for filtering — only
`tujuan` + `jenis` drive filters/counts — but was kept in sync.)

**Yoga (batch 1 — complete):** 12 distinct variants — Yoga untuk Pemula, Yoga
Flow, Yoga untuk Turun Berat Badan, Yoga Fleksibilitas, Yoga untuk Mindfulness &
Relaksasi, Mobility & Recovery, Active Recovery Flow, Kebugaran untuk Pemula,
Peregangan Harian, **Yoga Kekuatan Inti** (Core Power, Bangun Otot),
**Yoga Pembuka Pinggul** (Hip-Opening), **Yoga Punggung & Postur** (Backbend &
Posture). Backed by a **69-pose yoga/mobility library** (37 existing + 32 newly
authored bilingual poses). No two yoga programs share more than one exercise
(overlap ≤ ~17%), and no yoga program shares more than one exercise with any
non-yoga program either.

## Variation Rules & Overlap Checker

1. Within a program: vary `movementPattern` & `equipment`; avoid repeating the
   same pattern repeatedly.
2. Between programs: exercise overlap must be the minority — target **≤ ~20–30%**
   for adjacent-theme programs; most exercises in each program should feel new.
   This applies **across Jenis too** (a yoga program must not duplicate a
   functional/HIIT program), not only within a Jenis.
3. Expand the exercise library as needed to support (2) — not capped at the
   original 70. Yoga is now 69 poses; other Jenis expand in their own batches.
   **Movement-pattern variety note:** the `movementPattern` taxonomy (squat,
   hinge, push, pull, core, balance, cardio, mobility) does not map cleanly onto
   restorative disciplines. Recovery / flexibility / breath yoga programs are
   *expected* to be mobility-dominant, and a dedicated core-strength program is
   *expected* to be core-dominant. The checker's low-variety line is therefore
   **informational for jenis=yoga** and is not a publish blocker; only the
   overlap-pair count gates publishing (checker exit code).
4. **Pre-publish validation:** `tools/overlap_check.py` flags program pairs whose
   exercise sets exceed the overlap threshold, and programs with low
   movement-pattern variety. Run it before shipping catalog changes:
   ```
   python3 tools/overlap_check.py --threshold 0.30
   ```

## Landing Stats

The landing stat strip shows **3 tiles**: program count, total exercise/session
count, and goal count (the program/session counts are computed from live data so
they never go stale when the catalog changes). The **"Lokasi · Rumah & Gym" tile
was removed** — location is internal-only and not surfaced to members (see §8.2).

## Design System (aligned with my20fit dashboard)

The workout module is **visually aligned with the member dashboard**
(`my.20fit.id/dashboard`) so both read as one product. Alignment is driven by the
theme tokens in `rootTheme` (light + dark), so a single change re-skins every
component (cards use `var(--glass*)` — repurposed from translucent "glass" to
**solid** surfaces).

- **Primary red:** **`#C41101`** (same in light & dark — was `#E4002B` / `#FF3B57`).
- **Background:** warm cream **`#EDE8DF → #E4DDD2`** (light) / near-black
  **`#111009 → #0A0908`** (dark) — flat, replacing the old cool gradient.
- **Text / muted:** `#0A0908` / `#36322D` / `#9E8E7A` (light); `#F0EDE6` / `#C8C0B4`
  / `#6E665C` (dark) — mirrors the dashboard palette.
- **Cards (`glassCard` + `var(--glass)`):** **solid** (`#FFFFFF` light / `#131310`
  dark), 1px subtle warm border, radius **18px**, soft shadow
  `0 8px 24px rgba(20,17,12,.06)` — the dashboard's `.app-card` look (no more
  frosted-glass translucency).
- **Typography:** body **Inter**; headings (`h1–h6`) **Anton** (the dashboard's
  display face); labels stay **Barlow Condensed**; numbers **JetBrains Mono**. Anton
  + Inter are loaded from Google Fonts via a `<link>` in the head (Barlow / JetBrains
  Mono remain self-hosted).

The colored **gradient goal tiles** and **featured-program gradients** are kept as
deliberate accents (the dashboard likewise uses chart/accent colors); the hero panel
stays dark in both themes.

**Program logos = a per-program emoji.** Each of the 36 programs has its **own**
emoji (`pEmojiFor(p,size)` → `_progEmoji` keyed by program id, e.g. HYROX
Foundation 🏋️ · HYROX Kondisi Total 💥 · Endurance Circuit 🔁 · HYROX Pemula 🌱 ·
Simulasi Race 🏁), chosen to be **distinct within each Jenis** so a category-filtered
list isn't monotone. It falls back to a per-category emoji (`_pEmojiMap`: 🏋️ hyrox ·
🤸 functional · 🏠 home · 🧘 yoga · 🩰 pilates · 💆 recovery · 🔥 hiit · 💪 strength ·
🎯 core · 🏃 cardio) if an id is missing. Used on the **catalog program list**,
**history**, **resume**, **favorites**, and **playlist-detail** rows. It is
**deliberately NOT shown on the in-program exercise list** (`workoutRows`): there
every exercise shares the program's category, so a repeated identical emoji is pure
noise — those rows are **text-only** (name + equipment) for a cleaner, more scannable
list. The **filter chips, nav pills, and goal/type tiles keep clean SVG icons**
(`this.icon`) since they're UI controls, and the featured-card watermark stays SVG.

## Rollout

Staged, one Jenis per batch (for coach QA).

- **Batch 1 — Yoga: ✅ complete.** 12 low-overlap variants, library expanded to
  69 poses, all yoga-involving overlap pairs resolved, "Show more" pagination
  added, landing stats and PRD updated. Catalog now **39 programs / 157 unique
  exercises**.
- **Batch 2 — HIIT: ⏳ next.** Same method: author new HIIT-native exercises,
  add distinct sub-goal variants, curate to ≤30% overlap (within HIIT and vs
  other Jenis), verify with the checker.
- **Batches 3–6 — Functional, HYROX, Pilates, Strength: pending.** These still
  carry the pre-batch overlap flagged by the checker; each will be re-curated in
  its own batch.

Infrastructure (filter structure, data model, metadata tagging, overlap checker,
dynamic landing stats, pagination) is in place and reused by every batch.

## Appendix — Asset / Content Needs (photos)

Home's Explore pills and Featured cards ship with **designed placeholder gradient
blocks**; real photos are pending 20FIT sourcing. Structure already accepts a CMS
photo URL per item (`_goalImg` / `_typeImg` / `_featImg` in `renderVals`) — drop
in URLs, no code change. Full brief with framing/orientation notes: **`SHOTLIST.md`**.

Do **not** reuse photos/assets from other brands (iFIT, etc.) — 20FIT must source
its own (gym, members, coaches). Prioritise the 3–4 **Featured** shots first (most
visible on Home).

| Set | Count | For |
|-----|-------|-----|
| Explore by Goal | 4 | Turunkan Berat Badan, Bangun Otot, Daya Tahan, Kebugaran & Pemulihan |
| Explore by Type | 6 | HYROX, Functional, Yoga, Pilates, HIIT, Strength |
| Featured Programs | 3–4 | Currently HYROX Foundation (p1), Functional Conditioning (p2), Yoga Flow (p4) — confirm with coach before shoot |
