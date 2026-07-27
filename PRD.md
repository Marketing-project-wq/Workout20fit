# 20FIT — Product Requirements (Data Model & Taxonomy)

> Living doc kept in sync with the bundled app (`Workout 20FIT (1).html`).
> All new program names & descriptions are **representative placeholders** and
> must be reviewed by a 20FIT coach before going live, consistent with the
> in-app guidance disclaimer.

## 8. Data Model

### 8.1 Program

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique, `p<N>` |
| `name` | string | Display name (ID). English via translation map. |
| `icon` | string | Icon key: `hyrox, functional, home, yoga, pilates, recovery, group, hiit, strength, core, cardio` |
| `tags` | string[] | Goal categories this program belongs to (see 8.3) |
| `duration` | string | **Duration bucket** — `"20-40 menit"` or `"40-60 menit"` (EN: `"20-40 min"` / `"40-60 min"`). Drives the duration sub-filter. |
| `desc` | string | Short description (ID). English via translation map. |

Workouts belong to a program via `wp[programId] = Workout[]`.

### 8.2 Workout

`{ id, name, level(beginner|intermediate|advanced), equipment[], zones[], location[](home|gym), benefit, howTo:{ steps[], mistakes[], tips } }`.
All human-readable strings are localized through the `EN` translation map
(Indonesian is the source of truth; English is looked up, falling back to ID).

### 8.3 Goal Taxonomy (categories → sub-goal program variants)

Each **Tujuan** (goal category) renders **multiple sub-goal program variants**
(target 4–6), named with the pattern **`[Jenis] untuk [Sub-tujuan]`** (or a
descriptive variant). The category view is **data-driven and reusable**: adding
a program to any category automatically appears with the same card style,
duration sub-filter, and count label — no per-category hardcoding.

| Category (tag) | Sub-goal program variants |
|----------------|---------------------------|
| **HYROX** (`hyrox`) | HYROX Foundation · HYROX untuk Pemula · HYROX Simulasi Race · Group HYROX Class · HYROX Endurance Circuit |
| **Functional** (`functional`) | Functional Conditioning · Home Functional (Tanpa Alat) · Functional untuk Pemula · Functional Pembakar Lemak · Functional Kekuatan Inti |
| **Yoga** (`yoga`) | Yoga Flow · Yoga untuk Pemula · Yoga untuk Turun Berat Badan · Yoga Fleksibilitas · Yoga untuk Mindfulness & Relaksasi |
| **Pilates** (`pilates`) | Pilates Mat · Pilates untuk Pemula · Pilates untuk Core · Pilates untuk Postur · Pilates Sculpt |
| **Turunkan Berat Badan** (`turun_bb`) | HIIT Fat Burn · Cardio Blast · Core & Sculpt · Turun Berat Badan untuk Pemula · Fat Loss di Rumah |
| **Bangun Otot** (`otot`) | Strength Foundations · Full Body Strength · Bangun Otot untuk Pemula · Otot Tubuh Atas · Otot Tubuh Bawah |
| **Daya Tahan** (`daya_tahan`) | HYROX Endurance Circuit · Cardio Blast · Daya Tahan untuk Pemula · Stamina & Kardio |
| **Kebugaran & Pemulihan** (`wellness`) | Mobility & Recovery · Active Recovery Flow · Kebugaran untuk Pemula · Peregangan Harian |

> Programs are multi-tagged, so a program can appear under more than one goal.

## Category Detail UI (reusable component)

When a user selects a single goal chip (not "Semua/All"):

1. **Count label** above the list — `"<N> PROGRAM"` (EN: `PROGRAM` / `PROGRAMS`).
2. **Duration sub-filter** — secondary pills derived from the durations present
   in that category: `[Semua durasi] [20-40 menit] [40-60 menit]`.
3. Program cards show `duration · description`.

All three are generated from the program data (no hardcoded lists), so any new
program in any category inherits the behaviour automatically.
