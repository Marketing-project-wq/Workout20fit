# 20FIT Workout — Product Requirements (PRD)

> **Status:** living doc, kept in sync with the bundled app (`Workout 20FIT (1).html`).
> **Last updated:** 2026-09 (session revamp: program collections, mobile fixes, anonymous-access foundation).
> **Owner:** Marketing@20fit.id · **Environments:** staging `workout20fit-staging.up.railway.app`, production `workout.20fit.id`.
>
> All program/exercise/episode names & descriptions are **representative placeholders**
> and must be reviewed by a 20FIT coach before going live, consistent with the in-app
> guidance disclaimer. Video content is **unverified for embedding** until it passes
> `tools/video-check.html` in a YouTube-capable browser.

---

## 1. Product overview

20FIT Workout is the **workout-streaming module** of the 20FIT product, aligned visually
with the member dashboard (`my.20fit.id`) so both read as one product. Members browse
guided workout content — individual **sessions** and multi-episode **programs** — follow
along to embedded video, and track their activity (history, favorites, playlists).

**Design principle: function over feature.** A new user should understand what 20FIT is
and reach a relevant workout in one or two taps. Every screen block earns its place.

**Primary platform: mobile browser.** Most members access via phone. Mobile layout,
performance, and safe-area handling are first-class (see §11 Known issues / audit).

---

## 2. Architecture & stack

- **Single-file bundled web app.** The entire app ships as one static HTML file
  (`Workout 20FIT (1).html`, ~1.4 MB): an SPA built on a **custom template framework**
  (directives `sc-if` / `sc-for`, a `DCLogic`-style component class) — **not** React/Next/Vue.
  The view-model lives in a `<script type="text/x-dc">` inside a JSON `__bundler/template`
  block; fonts and assets are embedded (base64) in a manifest bundle.
- **Server:** `server.js` — a zero-dependency Node static server. The **same bundle**
  powers two Railway services: the **user app** (default) and the **CMS admin**
  (`CMS_MODE=1` env, or the `/cms` path). Deploy: NIXPACKS on Railway.
- **Supabase** (project "20FIT ALL DATA"):
  - **Auth** — GoTrue email + password (`auth.users`). Structured to add Google OAuth
    later without schema change.
  - **CMS content** — `w20fit_workout_cms` (row `default`): `types`, `collections`,
    `series`, `programs`, `workouts`, `hero`, plus uploaded card photos. **Authoritative
    over the code seed** when it has content (`_applyCmsLoaded` merges: loaded wins, seed
    fills gaps / appends new ids).
  - **Per-user data** — `public.w20fit_user` (one row per `auth_user_id`): `full_name`,
    `email`, and a `data` jsonb (`favorites`, `playlists`, `history`). RLS: `auth.uid() =
    auth_user_id`.
- **i18n:** every user-facing string goes through `L('id','en')`; default language **ID**.
- **Theming:** light + dark, driven by CSS custom-property tokens injected on the app root
  (`rootTheme`). Default theme **light**.

### 2.1 Editing the bundle safely

Because the app is one minified line, changes are made by **patching strings via script**
with roundtrip validation, never by hand-editing the giant line:
1. Parse the `__bundler/template` JSON, edit the inner string, re-pack with
   `JSON.stringify(t).replace(/<\//g,'<\\/')` (never emit a literal `</script>`).
2. Validate: template JSON must still `JSON.parse`, and the extracted view-model must pass
   `node --check`.
3. Bump the CMS cache token (`20fit_cms_vNN`) so returning clients refetch.

> **Testing constraint:** YouTube, Supabase, and `*.20fit.id` are **egress-blocked** from
> the build environment. End-to-end verification (login, video playback, live rendering)
> must be done on a real device / browser. Static validation only in CI/agent.

---

## 3. Users & access model

- **Registered members** (current default): Supabase email + password. Session restored on
  return; activity synced to `w20fit_user`.
- **Anonymous / guest access** — **BUILT BUT CURRENTLY DISABLED** (see §12 Roadmap).
  Infrastructure exists (`_guestBoot`, guest localStorage persistence, `anon_id` cookie,
  episode gate) but the guest boot path blanked the app for logged-out users in production
  and was rolled back. Re-enable only after reproducing + fixing the crash under a headless
  browser. Until then, the app **requires login**.

---

## 4. Information architecture (screens)

**User app** (`app: 'user'`):

- **Auth** — Login / Register / Forgot-password (`showAuthScreen`).
- **Home / Beranda** (`nav:'home'`) — function-first onboarding funnel (see §5).
- **Latihan / Exercise** (`nav:'exercise'`) — the catalog: two-dimension filters,
  session list, **Program (collections)** shelf, and **Sport Categories** browse.
- **Favorit** — saved sessions.
- **Playlist** — user-built ordered playlists of sessions.
- **Account** — profile (name + avatar), workout history, logout; guest CTA when applicable.
- **Session detail** — a workout with its embedded video, exercise list, and the guided
  **tempo timer**.
- **Program feature** — Collection page → Series (program) detail → **Episode player**.
- **Player** — the guided-set tempo player for a session's exercise.
- **Bottom tab bar** — mobile dock; safe-area aware.

**CMS admin** (`app: 'cms'`, separate deploy): manage Collections / Series / Episodes /
Types / Sessions, with photo upload per card. Out of scope for the member UI.

---

## 5. Home / Landing funnel

Home is a **goal-led onboarding funnel**, not a second catalog. Sections in order: compact
**Hero** ("Train hard. Recover smart." + single real CTA "Mulai Latihan"); thin **Stats
strip** (live counts); conditional **Resume** card (last workout from `history[0]`) or a
first-timer nudge; **"Jelajahi berdasarkan Tujuan"** (4 gradient goal cards, primary);
**"Jelajahi berdasarkan Tipe"** (compact type pills, secondary); **Featured / Program
cards**; **"Cara kerjanya"** (3 steps); closing CTA. The nav is 3 pills (Latihan / Favorit /
Playlist); the logo returns Home.

Explicitly **not** on Home (kept in Latihan): history, search, chip filters, duration
sub-filter, full program list.

---

## 6. Content model — two systems

The app has **two parallel content systems** that share the design language:

### 6.1 Sesi Latihan (sessions) — the catalog

Individual workouts filtered on **two independent dimensions**:
- **Jenis Latihan** (type, single-select): HYROX, Functional, Yoga, Pilates, HIIT,
  Strength (+ extra types e.g. Calisthenic, Dance). 
- **Tujuan** (goal, single-select): Turunkan Berat Badan, Bangun Otot, Daya Tahan,
  Kebugaran & Pemulihan.

After a filter is chosen, a **duration sub-filter** (`Semua / 20-40 / 40-60 menit`) and an
`N SESI` count appear. The list is **paginated** ("Lihat lebih banyak", `progLimit`,
initially 8; +8 per tap). Each session has a video, an exercise list, and the guided
**tempo timer** (Warm-up → Work count-up → Rest count-down per set; see §7.2).

> Data source of truth for catalog content is **Supabase** (`w20fit_workout_cms`), which
> wins over the code seed. Adding new content via seed appears in prod (`_applyCmsLoaded`
> appends new ids); **editing existing content** must go through the CMS.

### 6.2 Program (Collections → Series → Episodes) — the "streaming" feature

A magazine-style, multi-episode structure (Apple Fitness+-like):

- **Collection** (card on the "Program" shelf in Latihan). **9 collections:** Strength,
  Pilates & Yoga, HIIT & Kardio, Persiapan HYROX, Mobilitas & Pemulihan, Low Impact &
  Pemula, Lari, Postur Tegak, Tenang. Each has a card photo (CMS-uploaded, stable) and a
  gradient fallback.
- **Series** = a "program" inside a collection. **44 series total**, each with a title,
  subtitle, description, and **≥ 8 episodes** (a hard content rule — every program is
  filled to at least 8).
- **Episode** = `{id, title{id,en}, video (YouTube), duration, status, order}`. The
  **episode player** builds a `youtube-nocookie.com/embed` iframe
  (`rel=0&autoplay=1&modestbranding=1&playsinline=1`, `allowFullScreen`, `loading=lazy`,
  `onError` fallback). Episode number = position (`order`) within the series.

**Program shelf UX:** the "Program" section shows **3 collection cards initially** with a
**"Lihat lebih banyak"** toggle (matching the Sport Categories pattern) — mobile-friendly,
one clean desktop row.

> **Naming rules (from working notes):** collection names must not share a word with any
> category name (so two card rows never read as the same thing); one thing has exactly one
> name across the app; category names (HYROX, Yoga, …) are intentionally identical in ID/EN.
> An open decision exists to rename the shelf umbrella from "Program" to something looser
> ("Koleksi" / "Kurasi 20FIT") so themed collections (Travel-Friendly, No-Shoes, …) can be
> added without feeling inconsistent — **not yet executed**.

---

## 7. Data model

### 7.1 Program / Session (catalog)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `p<N>` (or extra-type ids) |
| `name`, `desc` | string | ID display; EN via translation map |
| `jenis` | string | single: `hyrox, functional, yoga, pilates, hiit, strength, …` |
| `tujuan` | string[] | subset of `turun_bb, otot, daya_tahan, wellness` |
| `duration` | string | `"20-40 menit"` / `"40-60 menit"` |
| `exercises` | via `wp[id]` | ordered exercise list |

### 7.2 Exercise + guided tempo timer

Exercises carry `level, benefit, howTo{steps,mistakes,tips}, equipment[], zones[]
(muscle groups), movementPattern, location[] (internal only — not surfaced)`. Demo videos
live in a **shared master library** (`data/exercise-library.json`, ~177 movements) resolved
by slug; a video renders only when `embeddable && verifiedByCoach` (+ owned or a
third-party with a source link). **Attribution** (third-party) is shown under the player and
cannot be hidden; a **legal attributions page** (`/legal/attributions`) auto-lists creators
of currently-shown third-party videos + a takedown contact.

The tempo timer follows the 20FIT app's guided-set flow: **Warm-up (3-2-1) → Work (counts
UP; user ends with "Lanjut"/"Selesai") → Rest (counts DOWN; skippable) → next set →
Done/"Ulangi"**. Phase labels BERSIAP / LATIHAN / ISTIRAHAT / SELESAI; a red guidance line
always states the next action. Deferred: voice cues, "+30 sec" rest extend.

### 7.3 Collection / Series / Episode (Program feature)

- **Collection:** `{id, title{id,en}, subtitle, color (gradient), photo (CMS base64)}`.
- **Series:** `{id, colId, title{id,en}, subtitle, desc, cover, date, status, order,
  episodes[]}`.
- **Episode:** `{id, title{id,en}, sub, video (YouTube URL), duration, status, order}`.

### 7.4 Per-user data (`w20fit_user`)

`data` jsonb: `{favorites[], playlists[], playlistSeq, history[]}` (+ `avatar`, and the
dormant `epBonus` for the gate). `full_name` column holds the display name (edited name
persists here). History entries are `{id, at}` (program-level, deduped, cap 12), recorded
**on open** today (see §12 for the >50%-watched change).

### 7.5 Playlists

`{id, name, workoutIds[]}`. Built from the Playlist tab; create + delete with confirm. The
empty state shows a **single** "Buat Playlist Pertama" CTA (the top "+ Buat Playlist Baru"
is hidden until at least one playlist exists).

---

## 8. CMS

The CMS (separate deploy) manages Types, Collections, Series, Episodes, and Sessions, each
with **photo upload** (base64 data-URI, with X/Y/zoom framing). Edits persist to Supabase
and **lock immediately** — card photos and content don't change on refresh. Session/episode
forms warn when a video link is already used by another slot (`_videoUses`) — a warning,
not a block (a video may intentionally be reused).

---

## 9. Video catalog & verification

- **Sources of embeds:** owned or official third-party YouTube iframes only — no download /
  re-host; third-party frames never used as thumbnails or marketing assets.
- **Verification:** a video is **unverified** until it passes `tools/video-check.html`
  (opened in a YouTube-capable browser) which catches owner-disabled embeds (101/150) and
  reads real title/channel/duration. `npm run check:videos` does an offline structural pass
  (empty slots, broken/duplicated ids) + oEmbed probe. Per-slot backups in
  `data/catalog-video-backups.json`.
- **Program episodes** are sourced via real YouTube search, deduped against all existing
  ids; embeds remain **unverified** until checked on a real browser.

---

## 10. Design system & theming

Aligned with the my20fit dashboard.

- **Primary red** `#C41101` (light & dark).
- **Background** warm cream `#EDE8DF → #E4DDD2` (light) / near-black `#111009 → #0A0908`
  (dark). Painted on `html`/`body` **and** kept theme-synced (see §11 BUG-001 fix), with
  `overscroll-behavior:none`.
- **Text/muted** `#0A0908 / #36322D / #9E8E7A` (light); `#F0EDE6 / #C8C0B4 / #6E665C` (dark).
- **Cards** solid `var(--glass)` (`#FFFFFF` light / `#131310` dark), 1px warm border, radius
  18–20px, soft shadow.
- **Typography:** body Inter; display headings **Anton**; labels **Barlow Condensed**;
  numbers/meta **JetBrains Mono**. (Note: embedded `@font-face` set is Barlow Condensed,
  JetBrains Mono, Manrope — verify Anton/Inter are actually loaded vs. system fallback.)
- Collection/goal/type **gradients** are deliberate accents; per-program **emoji** logos
  are distinct within each category.

---

## 11. Current release status & known issues

### Shipped this cycle
- **Program feature filled out:** 9 collections, 44 series, **every series ≥ 8 episodes**
  (real-video); new benefit-driven programs added inside existing collections (Bebas Nyeri
  Punggung Bawah, Leher & Bahu Rileks, Lutut Kuat & Aman, Fleksibilitas Total, Perut
  Kencang, HIIT Tanpa Lompat).
- **"Lihat lebih banyak"** on the Program shelf (initial 3).
- **BUG-001 fixed** — the white/blue "bleak" area at page bottom: `html`/`body` now painted
  with the theme background, `overscroll-behavior:none`, theme synced to `html`/`body` via
  `_syncPageBg` (was previously only on an inner wrapper).
- **Mobile audit fixes:** input `font-size` → 16px (stop iOS zoom); `100vh` → `100dvh`
  fallback; `&playsinline=1` on embeds; body scroll-lock while a modal is open;
  `overscroll-behavior:contain` on modal lists.
- **Playlist empty state** shows a single create CTA.
- **Guest local persistence + episode gate** built, then the guest-boot **disabled** after
  it blanked prod for logged-out users (dormant, pending fix).

### Known issues / backlog (from the mobile audit — `audit_mobile_findings.csv`)
- **P2:** many `@font-face` weights inflate the bundle (fonts embedded → CLS-swap risk is
  low but bundle is heavy); no skeleton/loading state; fixed bottom nav uses
  `backdrop-filter: blur(22px)` over scroll (possible jank on low-end — unmeasured).
- **P2/P3:** verify Anton/Inter actually load (embedded faces are Barlow/JetBrains/Manrope);
  tap targets on some chips likely < 44px (needs device test); `--glass:#FFFFFF` reads
  slightly cool vs the cream page (tone seam); no `srcset`/`sizes` on images.
- **Performance numbers were NOT measured** (Lighthouse/bundle-analyzer unavailable); items
  needing a real device are tagged `NEEDS_DEVICE_TEST`.

---

## 12. Roadmap / open work

1. **Re-enable anonymous access (highest priority once fixed).** The whole guest funnel is
   built (guest boot, `20fit_data_guest` persistence, `anon_id` cookie, episode gate:
   ep 1-3 free, ep 4+ requires an account with a 5-minute preview + overlay + one-time
   per-series "Nanti aja" bonus). It is **disabled** because the guest boot path (never
   exercised before) crashed the app for logged-out users. **Next step:** reproduce under a
   headless browser (guest mode is client-side, doesn't need YouTube/Supabase), find and fix
   the crash, verify, then re-enable.
2. **">50%-watched" history/limit accounting** (product decision + player work). History is
   recorded on open today; the spec wants it recorded only after ≥50% watched. True
   playback-accurate timing needs the **YouTube IFrame Player API** (untestable here); a
   wall-clock duration-timer proxy is the pragmatic first step.
3. **Full login/monetization spec** (pasted separately): Supabase email-confirmation off,
   4-table schema (`watch_history`, `favorites`, `program_progress`, `anonymous_views`) with
   RLS, merge-on-signup (dedupe by `video_id + date`), analytics events, and the additional
   prompt triggers (post-session, resume, program-complete, history-strip card). Decide
   whether to migrate from the single `w20fit_user` model to the richer schema.
4. **Profile editing** — edit display name (persists to `full_name`) and avatar (store in
   `data.avatar`); latent `userAvatar` / `editProfile` state already exists.
5. **Program shelf umbrella rename** (Program → Koleksi/Kurasi) to allow themed collections
   (Travel-Friendly, No-Shoes, Kickboxing, …) without inconsistency.
6. **Catalog taxonomy batches** (from the prior data-model PRD): continue curating each
   Jenis to ≤ ~30% exercise overlap (Yoga batch complete; HIIT next; Functional/HYROX/
   Pilates/Strength pending). Validate with `python3 tools/overlap_check.py --threshold 0.30`.

---

## 13. Appendix — asset needs

Home Explore pills and Featured cards accept a CMS photo URL per item (`_goalImg`,
`_typeImg`, `_featImg`) — drop in URLs, no code change. Collection cards accept CMS-uploaded
photos (stable, locked). Full shot brief: `SHOTLIST.md`. **Do not reuse other brands'
assets** (iFIT, etc.) — 20FIT must source its own (gym, members, coaches).

| Set | Count | For |
|-----|-------|-----|
| Explore by Goal | 4 | Turun BB, Bangun Otot, Daya Tahan, Kebugaran & Pemulihan |
| Explore by Type | 6 | HYROX, Functional, Yoga, Pilates, HIIT, Strength |
| Collection covers | 9 | one per Program collection |
| Featured Programs | 3–4 | confirm with coach before shoot |
