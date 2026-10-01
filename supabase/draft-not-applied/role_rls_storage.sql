-- =====================================================================
-- RANCANGAN — BELUM DIJALANKAN, BELUM DISETUJUI
-- =====================================================================
-- Folder ini sengaja BUKAN supabase/migrations/ supaya `supabase db push`
-- tidak menjalankannya tanpa sengaja. Pindahkan ke migrations/ dengan
-- stempel waktu hanya setelah arahnya disetujui.
--
-- Proyek: cpvzwqptzcxnwzfzgrmt ("20FIT ALL DATA") — database BERSAMA.
-- Semua objek diawali w20fit_ supaya tidak bentrok dengan aplikasi lain.
--
-- Urutannya penting. Bagian 4, 5, dan 6 mengubah perilaku yang sekarang
-- dipakai produksi dan akan MEMATIKAN penyimpanan CMS kalau dijalankan
-- sebelum kode klien diubah — karena itu blok-blok tersebut sengaja
-- ditulis dalam keadaan dikomentari. Bagian 1-3 aman dijalankan lebih
-- dulu (menambah kolom & memperketat RLS yang sudah longgar), tapi tetap
-- menunggu persetujuan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BAGIAN 1 — Akun Coach & Dokter yang terpisah
-- ---------------------------------------------------------------------
-- Hari ini hanya ada satu baris non-admin: admin1@gmail.com, role 'coach',
-- nama "Coach/Dokter 20FIT (shared)". Selama satu login dipakai berdua,
-- RLS berbasis pemilik tidak ada artinya — auth.uid() keduanya sama.
--
-- Buat dulu akunnya lewat Supabase Auth (dashboard atau undangan email),
-- baru jalankan ini. Ganti alamat emailnya.

-- insert into public.w20fit_staff (user_id, role, nama)
-- select id, 'coach', 'Nama Coach' from auth.users where lower(email) = lower('coach@20fit.id')
-- on conflict (user_id) do update set role = excluded.role, nama = excluded.nama;

-- insert into public.w20fit_staff (user_id, role, nama)
-- select id, 'dokter', 'Nama Dokter' from auth.users where lower(email) = lower('dokter@20fit.id')
-- on conflict (user_id) do update set role = excluded.role, nama = excluded.nama;

-- Setelah akun masing-masing aktif, cabut akun bersama:
-- delete from public.w20fit_staff where user_id = '40bbba5b-eedc-4769-b76a-37e68020b44c';


-- ---------------------------------------------------------------------
-- BAGIAN 2 — Kolom pemilik & status media di w20fit_exercises
-- ---------------------------------------------------------------------
-- Tabel ini belum punya kolom pemilik sama sekali, jadi "coach hanya boleh
-- mengubah miliknya sendiri" belum bisa ditegakkan.

alter table public.w20fit_exercises
  add column if not exists owner_id    uuid references auth.users(id),
  add column if not exists updated_by  uuid references auth.users(id),
  -- draft -> processing -> ready; dipakai kalau pipeline transcode dipasang.
  -- 'ready' berarti berkasnya betul-betul bisa diputar.
  add column if not exists media_state text not null default 'ready'
      check (media_state in ('draft','processing','ready','failed')),
  -- Path di dalam bucket (bukan URL penuh), supaya objek lama bisa dihapus
  -- waktu videonya diganti. Hari ini yang disimpan hanya URL publik.
  add column if not exists storage_path text;

create index if not exists w20fit_exercises_owner_idx on public.w20fit_exercises(owner_id);
create index if not exists w20fit_exercises_media_idx on public.w20fit_exercises(media_state);

-- Backfill: 498 baris yang ada semuanya buatan admin (semua video YouTube,
-- tidak ada upload). Jadikan milik admin pemilik modul supaya tidak ada
-- baris tanpa pemilik yang langsung jadi tidak bisa diedit siapa pun.
update public.w20fit_exercises
   set owner_id = 'b8846280-e20f-4cae-a3d7-500c69dd0687'
 where owner_id is null;

-- Isi owner_id otomatis saat insert; catat penyunting terakhir saat update.
create or replace function public.w20fit_exercises_stamp()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(new.owner_id, auth.uid());
  else
    new.owner_id := old.owner_id;   -- kepemilikan tidak bisa dipindah lewat UPDATE biasa
  end if;
  new.updated_by := auth.uid();
  return new;
end; $$;

drop trigger if exists w20fit_exercises_stamp_t on public.w20fit_exercises;
create trigger w20fit_exercises_stamp_t
  before insert or update on public.w20fit_exercises
  for each row execute function public.w20fit_exercises_stamp();


-- ---------------------------------------------------------------------
-- BAGIAN 3 — RLS per peran di w20fit_exercises
-- ---------------------------------------------------------------------
-- Sekarang: admin/coach/dokter boleh mengubah gerakan SIAPA PUN
-- (w20fit_can_edit_exercises() tidak melihat pemilik).
-- Rancangan: admin semua, coach/dokter hanya miliknya sendiri.
--
-- CATATAN: w20fit_can_edit_exercises() juga dipakai keempat storage policy
-- (lihat Bagian 5). Jangan ubah isi fungsinya — tambahkan helper baru.

create or replace function public.w20fit_is_media_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.w20fit_my_role() in ('admin','coach','dokter');
$$;
revoke all on function public.w20fit_is_media_staff() from public;
grant execute on function public.w20fit_is_media_staff() to authenticated;

-- SELECT: tampilkan ke user hanya yang benar-benar siap diputar.
-- Perhatikan media_state — tanpa ini, video yang masih di-transcode akan
-- tampil sebagai terbit dan user menekan play ke berkas yang belum ada.
drop policy if exists w20fit_exercises_select on public.w20fit_exercises;
create policy w20fit_exercises_select on public.w20fit_exercises
  for select to authenticated
  using (
    (status = 'terbit' and media_state = 'ready')
    or public.w20fit_is_media_staff()
  );

drop policy if exists w20fit_exercises_select_anon on public.w20fit_exercises;
create policy w20fit_exercises_select_anon on public.w20fit_exercises
  for select to anon
  using (status = 'terbit' and media_state = 'ready');

-- INSERT: staff media, dan barisnya harus miliknya sendiri (admin bebas).
drop policy if exists w20fit_exercises_insert on public.w20fit_exercises;
create policy w20fit_exercises_insert on public.w20fit_exercises
  for insert to authenticated
  with check (
    public.w20fit_is_media_staff()
    and (owner_id = auth.uid() or public.w20fit_my_role() = 'admin')
  );

-- UPDATE / DELETE: pemilik atau admin.
drop policy if exists w20fit_exercises_update on public.w20fit_exercises;
create policy w20fit_exercises_update on public.w20fit_exercises
  for update to authenticated
  using  (public.w20fit_my_role() = 'admin' or (public.w20fit_is_media_staff() and owner_id = auth.uid()))
  with check (public.w20fit_my_role() = 'admin' or (public.w20fit_is_media_staff() and owner_id = auth.uid()));

drop policy if exists w20fit_exercises_delete on public.w20fit_exercises;
create policy w20fit_exercises_delete on public.w20fit_exercises
  for delete to authenticated
  using (public.w20fit_my_role() = 'admin' or (public.w20fit_is_media_staff() and owner_id = auth.uid()));

-- Kebijakan "assigned" dari Stage 3 dibiarkan apa adanya
-- (w20fit_exercises_select_assigned) — itu jalur pasien, bukan jalur publish.


-- ---------------------------------------------------------------------
-- BAGIAN 4 — Menutup lubang di w20fit_workout_cms
-- ---------------------------------------------------------------------
-- MENDESAK, terlepas dari urusan peran.
-- Policy sekarang: SELECT/INSERT/UPDATE untuk {anon, authenticated}
-- dengan using true / with check true. Anon key ikut terkirim di dalam
-- bundel publik, jadi siapa pun bisa menulis ulang seluruh katalog.
--
-- JANGAN jalankan sebelum klien CMS diubah memakai JWT user
-- (_sbSave sekarang memakai _sbHeaders() = anon key). Kalau dijalankan
-- lebih dulu, semua penyimpanan CMS akan gagal 403.

-- drop policy if exists w20fit_cms_insert on public.w20fit_workout_cms;
-- drop policy if exists w20fit_cms_update on public.w20fit_workout_cms;
--
-- -- Baca tetap terbuka: user web memang perlu membacanya tanpa login.
-- -- (w20fit_cms_read dibiarkan: for select to anon, authenticated using true)
--
-- create policy w20fit_cms_insert on public.w20fit_workout_cms
--   for insert to authenticated with check (public.w20fit_my_role() = 'admin');
-- create policy w20fit_cms_update on public.w20fit_workout_cms
--   for update to authenticated
--   using (public.w20fit_my_role() = 'admin') with check (public.w20fit_my_role() = 'admin');

-- Siapa yang boleh menulis blob ini ('admin' saja, atau semua staff media)
-- menunggu keputusan — lihat pertanyaan di LAPORAN_VIDEO_ROLE.md bagian 3d.


-- ---------------------------------------------------------------------
-- BAGIAN 5 — Storage policy per pengunggah
-- ---------------------------------------------------------------------
-- Sekarang: bucket w20fit-exercises PUBLIC, 100 MB/file, mime termasuk
-- video/quicktime (.mov HEVC dari iPhone — tidak bisa diputar Chrome).
-- Semua berkas ditulis datar ke folder 'ex/', dan setiap staff media boleh
-- menghapus berkas siapa pun.
--
-- Rancangan: satu folder per pengunggah — ex/<auth.uid()>/<berkas>.
-- Klien harus ikut diubah: _exUpload() sekarang menulis ke 'ex/<acak>.<ext>'.

-- Perketat bucket: 25 MB cukup untuk klip 30-60 detik; buang quicktime.
-- update storage.buckets
--    set file_size_limit = 26214400,
--        allowed_mime_types = array['video/mp4','video/webm','image/jpeg','image/png','image/webp']
--  where id = 'w20fit-exercises';

-- Baca: biarkan terbuka selama bucket-nya public.
-- (w20fit_ex_storage_read: for select to public using bucket_id = 'w20fit-exercises')

-- drop policy if exists w20fit_ex_storage_write  on storage.objects;
-- drop policy if exists w20fit_ex_storage_update on storage.objects;
-- drop policy if exists w20fit_ex_storage_delete on storage.objects;
--
-- create policy w20fit_ex_storage_write on storage.objects
--   for insert to authenticated
--   with check (
--     bucket_id = 'w20fit-exercises'
--     and public.w20fit_is_media_staff()
--     and (storage.foldername(name))[1] = 'ex'
--     and ((storage.foldername(name))[2] = auth.uid()::text
--          or public.w20fit_my_role() = 'admin')
--   );
--
-- create policy w20fit_ex_storage_update on storage.objects
--   for update to authenticated
--   using (
--     bucket_id = 'w20fit-exercises'
--     and (owner_id = auth.uid()::text or public.w20fit_my_role() = 'admin')
--   );
--
-- create policy w20fit_ex_storage_delete on storage.objects
--   for delete to authenticated
--   using (
--     bucket_id = 'w20fit-exercises'
--     and (owner_id = auth.uid()::text or public.w20fit_my_role() = 'admin')
--   );

-- Dua objek yatim yang sudah ada (1 Okt 2026, belum dirujuk baris mana pun):
--   ex/mup4ubq3-0aao2h.mp4
--   ex/mup4zjpt-tlsfra.mp4
-- Hapus lewat dashboard/API Storage, bukan DELETE SQL ke storage.objects —
-- DELETE SQL meninggalkan berkasnya di S3 dan malah bikin yatim yang tidak terlihat.


-- ---------------------------------------------------------------------
-- BAGIAN 6 — Realtime
-- ---------------------------------------------------------------------
-- Sekarang tidak ada satu pun tabel w20fit_* di publication supabase_realtime,
-- dan klien memuat katalog tepat SEKALI saat start. Tanpa bagian ini,
-- "muncul tanpa refresh" tidak mungkin.

-- alter publication supabase_realtime add table public.w20fit_exercises;
-- alter publication supabase_realtime add table public.w20fit_workout_cms;

-- REPLICA IDENTITY FULL supaya payload DELETE/UPDATE membawa nilai lama.
-- Untuk w20fit_workout_cms JANGAN dipasang: barisnya 3,4 MB, FULL akan
-- menggandakan beban WAL tiap simpan.
-- alter table public.w20fit_exercises replica identity full;

-- CATATAN PENTING soal payload:
-- Realtime memotong record di atas max_record_bytes (bawaan 1 MB). Baris
-- 'default' di w20fit_workout_cms berukuran 3,4 MB, jadi payload-nya TIDAK
-- akan terkirim utuh. Pola yang benar di klien: dengarkan event perubahan
-- sebagai sinyal, lalu fetch ulang barisnya — jangan pakai isi payload.
-- Untuk w20fit_exercises barisnya kecil, payload bisa dipakai langsung.

-- RLS tetap berlaku untuk Realtime: klien hanya menerima baris yang boleh
-- dia SELECT. Karena itu Bagian 3 harus sudah jalan sebelum Bagian 6,
-- supaya draft orang lain tidak bocor ke tab user.
