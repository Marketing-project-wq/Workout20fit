-- =====================================================================
-- AKSES CMS 20FIT — BELUM DIJALANKAN
-- =====================================================================
-- Berkas ini ditulis, bukan dieksekusi. Folder `supabase/pending/` sengaja
-- di luar `supabase/migrations/` supaya `supabase db push` tidak menyentuhnya.
-- Proyek: cpvzwqptzcxnwzfzgrmt ("20FIT ALL DATA") — database BERSAMA dengan
-- member app, booking Arena, dan Clinic. Semua objek baru diawali `cms_`
-- atau `w20fit_` supaya tidak bentrok.
--
-- Semua angka di bawah dari pembacaan read-only pada 1 Oktober 2026.
--
-- ---------------------------------------------------------------------
-- TEMUAN FASE 1 YANG MENGUBAH RENCANA
-- ---------------------------------------------------------------------
-- Rencana awal "pakai akun yang sudah ada, tidak usah bikin akun baru"
-- hanya jalan sebagian, karena:
--
-- 1. TIDAK ADA satu pun tabel coach/dokter yang terhubung ke auth.users.
--    * admin_users      : punya password_hash sendiri. id-nya bukan auth.users.id.
--                         Kolom berguna: email, role, unit, is_doctor, is_active.
--    * arena_coach_users: punya username + password_hash sendiri (DAN
--                         password_plain — lihat catatan keamanan di bawah).
--    * arena_coaches / gym_coaches / my20fit_coaches / my20fit_physiotherapists:
--                         direktori tampilan saja (nama, foto, bio). Tidak ada identitas.
--    * my20fit_doctors.admin_user_id menunjuk admin_users.id, bukan auth.users.id.
--    * w20fit_staff     : SATU-SATUNYA yang berkunci auth.users(id). 5 baris, milik modul ini.
--    Jadi Opsi A (penanda terhubung user_id) tidak tersedia untuk coach/dokter.
--
-- 2. Email bisa menjembatani, tapi cakupannya minoritas:
--    * admin_users      : 25 baris, semua punya email, hanya  4 yang punya akun
--                         Supabase Auth terverifikasi.
--    * arena_coach_users: 18 baris, semua punya email, hanya  8 yang punya akun
--                         Supabase Auth terverifikasi.
--    * DARI 4 DOKTER (admin_users.role='dokter'), NOL punya akun Supabase Auth.
--      Artinya: dengan aturan "tidak boleh bikin akun baru", tidak ada satu pun
--      dokter yang bisa masuk CMS. Ini keputusan produk, bukan sesuatu yang bisa
--      diakali SQL — lihat CMS_REPORT.md bagian 5.
--
-- 3. CELAH KEAMANAN yang ditemukan sambil jalan (BUKAN di tabel CMS, tidak
--    disentuh berkas ini, tapi wajib dilaporkan):
--    * public.shop_staff punya policy `shop_staff_write`:
--        FOR ALL TO authenticated USING (true) WITH CHECK (true)
--      Tabelnya punya kolom user_id dan role. Artinya SIAPA PUN yang login bisa
--      menyisipkan baris untuk dirinya sendiri dengan role apa pun. Kalau ada
--      sistem lain yang memberi akses berdasarkan shop_staff, member bisa
--      mengangkat dirinya sendiri. Berkas ini sengaja TIDAK memakai shop_staff
--      sebagai sumber akses.
--    * public.arena_coach_users menyimpan kolom `password_plain`. Sandi mentah
--      di dalam tabel. Di luar lingkup CMS, tapi perlu dibereskan pemiliknya.
--    * public.w20fit_workout_cms masih SELECT/INSERT/UPDATE untuk `anon`
--      dengan using true / with check true, dan anon key ikut terkirim di bundel
--      publik. Bagian 5 berkas ini menutupnya.
--
-- KEPUTUSAN: sumber akses gabungan (lihat Bagian 2), bukan satu tabel.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BAGIAN 1 — Tabel pengecualian
-- ---------------------------------------------------------------------
-- Dipakai untuk dua hal: menambah orang yang tidak terjaring sumber mana pun,
-- dan MEMBLOKIR orang yang terjaring tapi tidak boleh masuk. Blokir menang atas
-- semua sumber lain.
create table if not exists public.cms_overrides (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  allow         boolean not null default true,     -- false = blokir, menang atas apa pun
  role          text not null default 'staff' check (role in ('staff','admin')),
  business_unit text check (business_unit in ('gym','arena','clinic','recovery','all')),
  catatan       text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
alter table public.cms_overrides enable row level security;

-- Hanya admin CMS yang boleh melihat & mengubah daftar ini. Fungsi is_cms_admin()
-- didefinisikan di Bagian 2; policy dievaluasi saat dipakai, jadi urutan ini aman.
create policy cms_overrides_admin_all on public.cms_overrides
  for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());


-- ---------------------------------------------------------------------
-- BAGIAN 2 — Sumber kebenaran akses
-- ---------------------------------------------------------------------
-- Satu view yang menggabungkan semua jalan masuk, supaya fungsinya tetap
-- sederhana dan sumbernya bisa ditambah tanpa menyentuh policy mana pun.
--
-- Aturan email: HANYA email yang sudah terverifikasi di Supabase Auth
-- (email_confirmed_at not null). Tanpa itu, siapa pun bisa mendaftar memakai
-- alamat seorang coach dan mewarisi aksesnya.
--
-- `security_invoker = off` (bawaan) supaya view ini bisa membaca admin_users dan
-- arena_coach_users, yang RLS-nya menutup akses klien sepenuhnya.
create or replace view public.cms_staff_source as
  -- (a) sumber asli modul ini, berkunci auth.users — paling tepercaya
  select s.user_id,
         case when s.role = 'admin' then 'admin' else 'staff' end as cms_role,
         'all'::text as business_unit,
         'w20fit_staff'::text as sumber
    from public.w20fit_staff s
   where s.role in ('admin','coach','dokter')

  union all
  -- (b) admin / dokter / terapis dari sistem Clinic & Arena, dijembatani email
  select u.id,
         case when a.role in ('super_admin','admin') then 'admin' else 'staff' end,
         coalesce(a.unit, 'all'),
         'admin_users'
    from public.admin_users a
    join auth.users u on lower(u.email) = lower(a.email)
   where a.is_active
     and u.email_confirmed_at is not null
     and (a.role in ('super_admin','admin','dokter','therapist') or coalesce(a.is_doctor,false))

  union all
  -- (c) coach Arena, dijembatani email. Peran 'gro'/'hc' sengaja TIDAK ikut:
  --     mereka bukan coach maupun dokter.
  select u.id,
         case when c.role = 'admin' then 'admin' else 'staff' end,
         coalesce(c.unit, 'arena'),
         'arena_coach_users'
    from public.arena_coach_users c
    join auth.users u on lower(u.email) = lower(c.email)
   where c.is_active
     and u.email_confirmed_at is not null
     and c.role in ('coach','admin')

  union all
  -- (d) pengecualian manual yang memberi akses
  select o.user_id, o.role, coalesce(o.business_unit,'all'), 'cms_overrides'
    from public.cms_overrides o
   where o.allow;

revoke all on public.cms_staff_source from anon, authenticated;

-- Fungsi yang dipakai policy dan dipanggil klien lewat RPC.
-- security definer + stable + search_path terkunci.
create or replace function public.is_cms_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    -- blokir menang atas apa pun
    when exists (select 1 from public.cms_overrides o
                  where o.user_id = auth.uid() and o.allow = false) then false
    else exists (select 1 from public.cms_staff_source s where s.user_id = auth.uid())
  end;
$$;

create or replace function public.is_cms_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.cms_overrides o
                  where o.user_id = auth.uid() and o.allow = false) then false
    else exists (select 1 from public.cms_staff_source s
                  where s.user_id = auth.uid() and s.cms_role = 'admin')
  end;
$$;

-- Dipakai CMS untuk menampilkan peran & unit di layar, bukan untuk otorisasi.
create or replace function public.cms_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'is_staff', true,
       'is_admin', bool_or(s.cms_role = 'admin'),
       'units',    jsonb_agg(distinct s.business_unit),
       'sources',  jsonb_agg(distinct s.sumber))
       from public.cms_staff_source s
      where s.user_id = auth.uid()
        and not exists (select 1 from public.cms_overrides o
                         where o.user_id = auth.uid() and o.allow = false)),
    jsonb_build_object('is_staff', false, 'is_admin', false));
$$;

revoke all on function public.is_cms_staff() from public;
revoke all on function public.is_cms_admin() from public;
revoke all on function public.cms_me() from public;
grant execute on function public.is_cms_staff() to authenticated;
grant execute on function public.is_cms_admin() to authenticated;
grant execute on function public.cms_me() to authenticated;
-- anon tidak pernah butuh ini. `revoke from public` saja tidak cukup: default
-- privileges Supabase memberi EXECUTE ke anon untuk fungsi baru di schema public.
revoke execute on function public.is_cms_staff() from anon;
revoke execute on function public.is_cms_admin() from anon;
revoke execute on function public.cms_me() from anon;


-- ---------------------------------------------------------------------
-- BAGIAN 3 — Fallback: coach/dokter yang belum punya akun Supabase Auth
-- ---------------------------------------------------------------------
-- Ini jawaban untuk ~30 orang yang terdaftar sebagai coach/dokter tapi tidak
-- punya akun Supabase Auth (termasuk SEMUA 4 dokter). Mereka tidak bisa masuk
-- lewat jalur mana pun di Bagian 2, karena memang tidak ada akunnya untuk dipakai.
--
-- Tabel ini TIDAK menciptakan akun. Dia hanya menyiapkan tempat supaya begitu
-- akunnya dibuat (lewat undangan Supabase Auth, satu kali, oleh admin), aksesnya
-- langsung menyala tanpa menyentuh SQL lagi. Jalankan hanya kalau keputusannya
-- memang membuat akun untuk mereka.
create table if not exists public.cms_staff (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'coach' check (role in ('coach','doctor','cms_admin')),
  business_unit text not null default 'gym'   check (business_unit in ('gym','arena','clinic','recovery','all')),
  is_active     boolean not null default true,
  nama          text,
  created_at    timestamptz not null default now()
);
alter table public.cms_staff enable row level security;
create policy cms_staff_admin_all on public.cms_staff
  for all to authenticated using (public.is_cms_admin()) with check (public.is_cms_admin());
create policy cms_staff_select_self on public.cms_staff
  for select to authenticated using (user_id = auth.uid());

-- Kalau tabel ini dipakai, tambahkan cabang ini ke cms_staff_source:
--   union all
--   select t.user_id,
--          case when t.role = 'cms_admin' then 'admin' else 'staff' end,
--          t.business_unit, 'cms_staff'
--     from public.cms_staff t where t.is_active;

-- Template pengisian massal: cocokkan email staf yang akunnya SUDAH dibuat.
-- Sengaja memakai email_confirmed_at supaya undangan yang belum diterima tidak
-- langsung memberi akses.
-- insert into public.cms_staff (user_id, role, business_unit, nama)
-- select u.id,
--        case when coalesce(a.is_doctor,false) or a.role = 'dokter' then 'doctor'
--             when a.role in ('super_admin','admin') then 'cms_admin'
--             else 'coach' end,
--        coalesce(a.unit,'all'), a.full_name
--   from public.admin_users a
--   join auth.users u on lower(u.email) = lower(a.email)
--  where a.is_active and u.email_confirmed_at is not null
--  on conflict (user_id) do update
--     set role = excluded.role, business_unit = excluded.business_unit, is_active = true;


-- ---------------------------------------------------------------------
-- BAGIAN 4 — RLS tabel konten: w20fit_exercises (Gerakan)
-- ---------------------------------------------------------------------
-- Kolom owner_id, updated_by, media_state, storage_path SUDAH ada di produksi
-- (migrasi w20fit_exercises_owner_media_state_and_realtime), begitu juga trigger
-- stempel pemilik dan pendaftaran Realtime. Yang di bawah ini mengganti policy
-- tulis dari "semua staf media setara" menjadi "pemilik saja, admin semua".
--
-- CATATAN: ini MENGUBAH perilaku yang sekarang berjalan. Setelah dijalankan,
-- coach/dokter tidak bisa lagi menyunting 498 gerakan lama (semuanya dimiliki
-- admin pemilik modul hasil backfill). Itu memang yang diminta brief, tapi
-- pastikan dulu itu yang diinginkan — lihat CMS_REPORT.md bagian 5.

drop policy if exists w20fit_exercises_select      on public.w20fit_exercises;
drop policy if exists w20fit_exercises_select_anon on public.w20fit_exercises;
drop policy if exists w20fit_exercises_insert      on public.w20fit_exercises;
drop policy if exists w20fit_exercises_update      on public.w20fit_exercises;
drop policy if exists w20fit_exercises_delete      on public.w20fit_exercises;

-- Publik & member: hanya yang terbit DAN videonya betul-betul siap diputar.
create policy w20fit_exercises_select_anon on public.w20fit_exercises
  for select to anon
  using (status = 'terbit' and media_state = 'ready');

-- Staf CMS: semua miliknya sendiri + semua yang sudah terbit. Admin: semua.
create policy w20fit_exercises_select on public.w20fit_exercises
  for select to authenticated
  using (
    (status = 'terbit' and media_state = 'ready')
    or public.is_cms_admin()
    or (public.is_cms_staff() and owner_id = auth.uid())
  );

create policy w20fit_exercises_insert on public.w20fit_exercises
  for insert to authenticated
  with check (
    public.is_cms_admin()
    or (public.is_cms_staff() and owner_id = auth.uid())
  );

create policy w20fit_exercises_update on public.w20fit_exercises
  for update to authenticated
  using      (public.is_cms_admin() or (public.is_cms_staff() and owner_id = auth.uid()))
  with check (public.is_cms_admin() or (public.is_cms_staff() and owner_id = auth.uid()));

create policy w20fit_exercises_delete on public.w20fit_exercises
  for delete to authenticated
  using (public.is_cms_admin() or (public.is_cms_staff() and owner_id = auth.uid()));

-- Policy jalur pasien dari Stage 3 (w20fit_exercises_select_assigned) dibiarkan.

-- Terbit hanya kalau videonya siap. Dipasang sebagai trigger, bukan CHECK,
-- supaya pesannya bisa dibaca manusia dan baris lama tidak ikut divalidasi ulang.
create or replace function public.w20fit_exercises_guard_publish()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status = 'terbit' then
    if coalesce(btrim(new.video_url), '') = '' then
      raise exception 'tidak bisa terbit: video belum diisi';
    end if;
    if new.media_state <> 'ready' then
      raise exception 'tidak bisa terbit: video masih %, belum ready', new.media_state;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists w20fit_exercises_guard_publish_t on public.w20fit_exercises;
create trigger w20fit_exercises_guard_publish_t
  before insert or update on public.w20fit_exercises
  for each row execute function public.w20fit_exercises_guard_publish();


-- ---------------------------------------------------------------------
-- BAGIAN 5 — Tabel konten kedua: w20fit_workout_cms (program, sesi, episode)
-- ---------------------------------------------------------------------
-- PENTING, dan tidak bisa diperhalus: program, sesi, koleksi, episode, dan
-- semua link videonya TIDAK berada di tabel berbaris. Semuanya hidup sebagai
-- SATU baris jsonb berukuran 3,4 MB (id='default') di w20fit_workout_cms.
--
-- Akibatnya aturan "staf hanya boleh mengubah konten dengan owner_id =
-- auth.uid()" TIDAK BISA ditegakkan untuk konten ini. Postgres mengunci per
-- baris, bukan per elemen di dalam satu jsonb. Yang bisa dilakukan sekarang
-- hanyalah menutup lubang anon dan membatasi penulisnya ke staf CMS.
--
-- Kepemilikan per konten baru mungkin setelah blob ini dipecah jadi tabel
-- (cms_collections / cms_programs / cms_episodes dengan owner_id). Itu migrasi
-- data tersendiri, dicatat di CMS_REPORT.md bagian 5.
--
-- JANGAN jalankan bagian ini sebelum klien CMS berhenti memakai anon key untuk
-- menulis (_sbSave memakai _sbHeaders() = anon). Kalau dijalankan lebih dulu,
-- semua penyimpanan CMS langsung gagal 403.

-- drop policy if exists w20fit_cms_insert on public.w20fit_workout_cms;
-- drop policy if exists w20fit_cms_update on public.w20fit_workout_cms;
--
-- -- Baca tetap terbuka: user web memang membacanya tanpa login.
-- -- (w20fit_cms_read dibiarkan apa adanya.)
--
-- create policy w20fit_cms_insert on public.w20fit_workout_cms
--   for insert to authenticated with check (public.is_cms_staff());
-- create policy w20fit_cms_update on public.w20fit_workout_cms
--   for update to authenticated
--   using (public.is_cms_staff()) with check (public.is_cms_staff());


-- ---------------------------------------------------------------------
-- BAGIAN 6 — Storage bucket video
-- ---------------------------------------------------------------------
-- SUDAH jalan di produksi (migrasi w20fit_exercise_storage_per_uploader):
--   * bucket w20fit-exercises: 25 MB/berkas, mime mp4/webm + gambar,
--     video/quicktime sudah dibuang (rekaman .mov iPhone = HEVC, gagal di Chrome).
--   * tulis hanya ke folder ex/<auth.uid()>/…, ubah & hapus hanya milik sendiri.
-- Yang di bawah mengganti pemeriksa peran dari w20fit_is_media_staff() ke
-- is_cms_staff() supaya satu sumber akses saja yang berlaku.

-- drop policy if exists w20fit_ex_storage_write  on storage.objects;
-- create policy w20fit_ex_storage_write on storage.objects
--   for insert to authenticated
--   with check (
--     bucket_id = 'w20fit-exercises'
--     and public.is_cms_staff()
--     and (storage.foldername(name))[1] = 'ex'
--     and ((storage.foldername(name))[2] = auth.uid()::text or public.is_cms_admin())
--   );
--
-- -- Bucket jadi private (keputusan "video harus login"). JANGAN dijalankan
-- -- sebelum klien menyimpan storage_path dan membuat signed URL saat menonton —
-- -- lihat CMS_REPORT.md bagian 5.
-- update storage.buckets set public = false where id = 'w20fit-exercises';
-- drop policy if exists w20fit_ex_storage_read on storage.objects;
-- create policy w20fit_ex_storage_read on storage.objects
--   for select to authenticated using (bucket_id = 'w20fit-exercises');


-- ---------------------------------------------------------------------
-- BAGIAN 7 — Realtime
-- ---------------------------------------------------------------------
-- SUDAH jalan di produksi: w20fit_exercises dan w20fit_workout_cms terdaftar di
-- publication supabase_realtime, dan w20fit_exercises sudah REPLICA IDENTITY FULL
-- (perlu supaya payload DELETE membawa id-nya).
--
-- w20fit_workout_cms SENGAJA tidak REPLICA IDENTITY FULL: barisnya 3,4 MB, FULL
-- akan melipatgandakan WAL tiap simpan. Lagi pula payloadnya memang tidak dipakai —
-- klien memperlakukan eventnya sebagai sinyal lalu fetch ulang, karena 3,4 MB di
-- atas max_record_bytes Realtime dan tidak akan terkirim utuh.
--
-- Kalau Bagian 5 dipecah jadi tabel berbaris, tabel-tabel barunya perlu:
--   alter publication supabase_realtime add table public.cms_<nama>;
--   alter table public.cms_<nama> replica identity full;
--
-- RLS tetap berlaku untuk Realtime: klien hanya menerima baris yang boleh dia
-- SELECT. Karena itu Bagian 4 harus sudah jalan sebelum ada draft orang lain,
-- supaya draft tidak bocor ke tab member.


-- ---------------------------------------------------------------------
-- BAGIAN 8 — Verifikasi setelah dijalankan
-- ---------------------------------------------------------------------
-- select public.is_cms_staff(), public.is_cms_admin(), public.cms_me();
-- select sumber, count(*) from public.cms_staff_source group by 1 order by 1;
-- -- harapan hari ini: w20fit_staff 5, admin_users 4, arena_coach_users 8
-- select count(*) from public.w20fit_exercises where status='terbit' and media_state<>'ready';
-- -- harus 0; kalau tidak, trigger Bagian 4 akan menolak update berikutnya pada baris itu
