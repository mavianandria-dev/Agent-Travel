---
title: Database Google Sheets
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-25
source:
  - google-apps-script/seed.gs
  - google-apps-script/code.gs
  - google-apps-script/appsscript.json
  - google-apps-script/README.md
  - google-apps-script/local-tests/mock-harness.mjs
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/seed.js
---

# Database Google Sheets

## Status

Tahap **seed produksi** tervalidasi oleh pengguna di spreadsheet nyata. **Backend API `code.gs` mode direct selesai** dan lulus **155 asersi mock test lokal** (`google-apps-script/local-tests/mock-harness.mjs`). Artinya: browser memanggil Web App `/exec` langsung, tanpa Cloudflare Worker atau proxy database.

Yang belum:

- Deploy Web App dan **probe CORS dari origin produksi** belum dilakukan. Ini gerbang utama sebelum frontend disentuh.
- Aplikasi React **belum terhubung** ke Google Sheets. Sumber data aktif tetap `localStorage` lewat `DB.load()`/`DB.save()`.
- Validasi booking/kursi/pembayaran di server belum ada.
- Jangan menyimpan data pelanggan/KYC nyata sebelum probe CORS dan Fase B–C selesai.

## Keputusan bentuk data

- Satu spreadsheet berisi satu tab per koleksi, ditambah `_meta`.
- Satu record disimpan sebagai satu baris.
- Kolom koleksi: `id`, `ord`, `json`, `updated_at`.
- Kolom `_meta`: `key`, `value`.
- Nested data seperti KYC, layout kursi, penumpang, dan pesan support tetap di dalam JSON.
- `settings` memakai `key` sebagai ID baris (`platformFee`).
- `fees` disimpan sebagai satu record legacy.
- Revisi per koleksi disimpan sebagai `rev.<koleksi>` di `_meta`; `commit` memakai `baseRev` sebagai pesimistis-lock.
- Semua penulisan memegang `LockService.getScriptLock()`.

## Seed produksi

`seedProduction()` di `google-apps-script/seed.gs` membuat database minimal untuk operasi nyata, bukan demo.

| Tab | Isi |
| :--- | :--- |
| `users` | Satu akun `superadmin` dari Script Properties |
| `settings` | `platformFee` default `{ type: 'percent', value: 8 }` |
| `fees` | Fee legacy `{ defaultType: 'percent', defaultValue: 8 }` |
| `audit` | Satu entri `seed_production` |
| 15 tab lainnya | Header saja, tanpa record contoh |

Script Properties seed: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`. Seed tidak membuat agen, pengemudi, pelanggan, armada, rute, jadwal, booking, pembayaran, voucher, review, banner, atau tiket contoh.

## Pengamanan seed

- Script terikat ke spreadsheet aktif; tidak butuh spreadsheet ID.
- `LockService` mencegah dua seed bersamaan.
- Seed berhenti jika `_meta` sudah berisi data atau salah satu tab koleksi sudah berisi record.
- Header benar tetapi kosong boleh ditulis ulang.
- `validateDatabase()` memeriksa header, JSON, ID, `ord`, `updated_at`, revisi, superadmin aktif, dan `settings.platformFee`.
- Tab `Sheet1` kosong dihapus.
- Tidak ada reset otomatis.

## Backend API `code.gs`

`code.gs` adalah Web App yang membaca/menulis tab hasil seed. Semua fungsi dan konstanta diawali `api`/`API_` agar tidak bentrok dengan `seed.gs` di scope global yang sama.

### Mode direct

- Default `REQUIRE_PROXY_KEY=false`: browser boleh memanggil tanpa `proxyKey`.
- Jika klien mengirim `proxyKey`, nilainya tetap harus cocok dengan `API_PROXY_KEY`; ini mencegah salah konfigurasi.
- `REQUIRE_PROXY_KEY=true` hanya untuk skenario proxy di masa depan.
- Alasan direct: Apps Script tidak bisa membaca header HTTP dan tidak menangani `OPTIONS`, sehingga token/gerbang harus lewat body. Dengan `Content-Type: text/plain;charset=utf-8`, browser tidak mengirim preflight.
- `setupBackend()` tetap membuat `API_PROXY_KEY` agar mode proxy bisa diaktifkan tanpa setup ulang, tetapi tidak dipakai oleh frontend saat direct.

### Autentikasi dan sesi

1. **Token sesi** = `base64url(payload).base64url(HMAC-SHA256(payload, API_TOKEN_SECRET))`.
2. Payload: `sub`, `role`, `agencyId`, `pv` (token version), `iat`, `exp`.
3. TTL default 12 jam (`TOKEN_TTL`).
4. `tokenVersion` disimpan di record user, **tidak pernah** dikirim ke klien.
5. Ganti password atau reset oleh superadmin menaikkan `tokenVersion`; token lama langsung ditolak.
6. Tidak ada refresh token.

### Password

- Hash: HMAC-SHA512 berulang, 2000 iterasi, salt acak + `PASSWORD_PEPPER`, algoritma `hmac-sha512-iter-v1`.
- Field: `passHash`, `passSalt`, `passIter`, `passAlgo`.
- User legacy dengan `pass` plaintext dimigrasi otomatis pada login pertama; `pass` dihapus dan `rev.users` dinaikkan.
- Password baru (register/ganti/reset/admin create) minimal **8** karakter. Password legacy yang lebih pendek tetap bisa login sampai diganti.
- Field rahasia (`pass*`, `password*`, `tokenVersion`) tidak pernah dikirim ke response dan ditolak jika masuk `commit`.

### Throttling

Berbasis `CacheService` (best effort):

- Login: 5 kegagalan / 15 menit per email → blokir 15 menit; login sukses menghapus hitungan.
- Ganti password: 5 kegagalan password lama → blokir 15 menit per user.
- Registrasi: 30 permintaan/jam global.
- Cache bisa hilang; ini bukan pengganti rate limit per IP di proxy.

### Aksi yang tersedia

| Aksi | Payload inti | Response inti | Peran |
| :--- | :--- | :--- | :--- |
| `health` | — | `{service, version, schemaVersion, now}` | publik |
| `login` | `email`, `password` | `{user, token, expiresAt}` | kredensial valid |
| `register` | `name`, `email`, `phone`, `password`, `role`, `agencyName?`, `agencyAddress?` | `{user, pending, token?, expiresAt?}` | publik |
| `session` | `token` | `{user}` | token valid |
| `bootstrap` | `token` opsional | `{user, role, records, revisions}` | token valid / publik |
| `commit` | `token`, `changes` | `{touched, revisions}` | hanya `superadmin` |
| `changePassword` | `token`, `currentPassword`, `newPassword` | `{user}` | token valid |
| `adminCreateUser` | `token`, data akun | `{user}` | hanya `superadmin` |
| `adminSetPassword` | `token`, `userId`, `newPassword` | `{user}` | hanya `superadmin` |

### Bootstrap per peran

| Peran | Koleksi |
| :--- | :--- |
| `superadmin` | semua 19 koleksi; record `users` disanitasi |
| `agen` | agensi sendiri penuh + agensi aktif lain terproyeksi; `routes`, `reviews` (publik + miliknya), `banners` (proyeksi), `settings`, armada/jadwal sendiri penuh + lain terproyeksi, `drivers`/`maintenanceRequests`/`routeRequests`/`ledger` milik agensi, `bookings` jadwal agensi, `payments` booking tersebut, `vouchers`, `supportTickets` terkait, `notifications` miliknya + `all`, `users` dirinya + agen/pengemudi agensi, `audit` miliknya |
| `pengemudi` | `routes`, `agencies` publik, `reviews` publik, `settings`, `drivers` dirinya penuh + rekan sesama jadwal minimal (`id`,`name`,`phone`,`photo`,`rating`,`status`), jadwal yang ditugaskan, booking jadwal tersebut, kendaraan jadwal tersebut, `maintenanceRequests` miliknya, `notifications` miliknya + `all`, `users` dirinya, `audit` miliknya |
| `pelanggan` | `banners`, `routes`, `reviews`, `agencies` publik, `vehicles` publik, `schedules` publik + `takenSeats`, `settings`, `vouchers`, booking/payment/notifikasi/tiket/audit miliknya, `users` dirinya |
| tanpa token | `banners`, `routes`, `reviews`, `agencies`, `vehicles`, `schedules` publik |

### Proyeksi publik

- `agencies`: tanpa `kyc`, `bank`, `rekeningNo`, dokumen, dan field internal. Field tampil: `id`, `name`, `logo`, `photo`, `address`, `phone`, `wa`, `email`, `rating`, `trips`, `status`, `serviceFee`, `feeType`, `feeValue`, `refundPolicy`, `description`.
- `vehicles`: tanpa `ownerName`/`ownerNik`/`ownerPhone`, `stnkPhoto`, `chassis`, `engine`, pajak/KIR, dan `coopDriverId`. `plate`, `layout`, `inactiveSeats`, fasilitas tetap ada.
- `schedules`: tanpa `driverId`/`driverName`/`backupDriverId`/`backupName`; ditambah `takenSeats`.
- `banners`, `routes`, `reviews`: dikirim apa adanya, tetap melewati penyaring field rahasia.
- Agensi `pending` tidak muncul di katalog publik; jadwal/armada/ulasan milik agensi pending disaring.
- `takenSeats` = kursi booking `paid`/`done`/`pending` + `blockedSeats` + `inactiveSeats` kendaraan, terurut. Frontend publik tidak menerima record booking.
- `bank` agensi **sengaja tidak** masuk proyeksi publik. Instruksi transfer perlu aksi khusus yang hanya mengembalikan rekening tujuan untuk booking milik pelanggan (Fase C).

### Aksi akun

- `register`: role hanya `pelanggan`/`agen`; validasi nama/email/telepon/password ≥ 8; pelanggan langsung token; agen membuat agensi + user `pending` tanpa token.
- `login`: verifikasi hash; migrasi plaintext; akun `pending`/`suspended` ditolak.
- `changePassword`: password lama benar, password baru ≥ 8 dan berbeda; token lama dicabut.
- `adminCreateUser`: hanya superadmin; role `agen`/`pengemudi`/`pelanggan`; satu agensi satu akun agen; pengemudi harus cocok dengan `drivers.userEmail` dan agensi sudah punya agen aktif; agensi pending memaksa user pending; pengemudi nonaktif tidak boleh punya jadwal aktif.
- `adminSetPassword`: hanya superadmin; password ≥ 8; token lama user dicabut.
- Semua aksi akun menaikkan `rev` koleksi yang ditulis agar commit klien dengan revisi lama tidak menimpa perubahan server.

### `commit`

Format:

```json
{
  "changes": {
    "routes": { "baseRev": 3, "upserts": [ {"id":"r_1","name":"Banda Aceh - Takengon"} ], "deletes": [] }
  }
}
```

Aturan:

- Hanya `superadmin`; semua 19 koleksi diizinkan.
- `baseRev` harus persis `rev.<koleksi>`; tidak cocok → `REV_CONFLICT`.
- Upsert divalidasi: objek dengan `id` (atau `key` untuk `settings`/`fees`), tanpa field rahasia, tanpa ID duplikat, JSON ≤ 45000 karakter.
- Delete sebelum upsert; urutan lama dipertahankan; record baru di akhir.
- Field password/`tokenVersion` yang tidak dikirim klien dipertahankan dari record lama, sehingga commit profil user tidak menghapus hash.
- Superadmin tidak boleh menghapus akunnya sendiri lewat `commit`.
- `bookings`/`payments` **belum** divalidasi kapasitas/harga/status di server. Jangan menulis lewat commit sampai validasi domain ada.
- Multi-koleksi belum atomik: jika tab kedua gagal, tab pertama bisa sudah berubah sementara `_meta.rev` belum diperbarui.

## Secret dan keamanan

- `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, `TOKEN_TTL`, `API_PROXY_KEY` dibuat `setupBackend()` di editor. Secret yang ada tidak ditimpa.
- Spreadsheet tetap privat; jangan mengaktifkan “Anyone with the link” pada file.
- Web App: **Execute as** `Me`, **Who has access** `Anyone`. URL adalah gerbang akses.
- `Content-Type` POST: `text/plain;charset=utf-8` untuk menghindari preflight.
- 155 asersi mock memeriksa secret/plaintext password tidak muncul di response, log, atau sheet akun yang sudah dimigrasi.
- Password frontend React masih dibandingkan di browser sampai Fase B selesai.

## Keamanan yang belum selesai

- **CORS belum diuji** dari origin GitHub Pages/dev. Jika respons tidak terbaca, direct mode batal dan perlu proxy.
- Login frontend masih client-side; jangan pakai akun nyata.
- Rate limit berbasis cache bisa hilang; rate limit per IP belum ada.
- Validasi kapasitas kursi, slot jadwal, harga, dan pembayaran di server belum ada.
- Registrasi/aksi admin belum menulis audit atau notifikasi selamat datang.
- Multi-koleksi belum transaksional.
- `takenSeats` membaca seluruh booking pada setiap bootstrap publik; performa perlu dipantau.
- Rekening agensi untuk instruksi transfer belum ada di jalur publik; perlu aksi scoped.

## Rencana integrasi

1. ~~Seed produksi + validasi database~~ — selesai.
2. ~~Backend `code.gs` mode direct: autentikasi, proyeksi publik, filter baris, aksi akun, throttle, token revocation~~ — selesai, 155 asersi.
3. **Probe CORS** dari origin produksi setelah deploy Web App.
4. **Fase B** — adapter baca frontend (`sheetsApi.js`, bootstrap async, token sesi, cache memori); belum ada tulis remote.
5. **Fase C** — aksi tulis per peran + validasi booking/kursi/pembayaran; audit/notifikasi; rekening scoped.
6. **Fase D** — pindah semua peran ke `VITE_DATA_MODE=sheets`; hapus jalur localStorage untuk data aplikasi. Pertahankan `localStorage` hanya untuk `session`, `lang`, draft checkout, dan identitas guest support.
7. Sinkronkan antar-tab lewat polling/`BroadcastChannel` bila perlu.

Lihat [[Lapisan Data dan Seed]] untuk perilaku data yang aktif sekarang, dan [[Technical Debt dan Jebakan]] untuk risiko arsitektur client-only.

## Uji lokal

`google-apps-script/local-tests/mock-harness.mjs` menjalankan **155 asersi**:

1. `setupBackend` + mode direct + `REQUIRE_PROXY_KEY`.
2. Login legacy → migrasi hash; login hash; token tamper/expired; token dicabut setelah ganti/reset password.
3. `bootstrap` superadmin/publik/agen/pengemudi/pelanggan; proyeksi tanpa KYC/NIK/rekening; filter baris; `takenSeats`; agensi pending.
4. `commit`: upsert/delete/konflik/role/ID duplikat/field rahasia/self-delete; hash bertahan saat commit profil.
5. `changePassword` + throttle login/ganti password.
6. `register` pelanggan/agen, validasi, agen pending.
7. `adminCreateUser`/`adminSetPassword`, aturan agen/pengemudi, pencabutan token.
8. `doGet`/`doPost`, body bukan JSON, `proxyKey` salah.
9. Tidak ada secret/plaintext password di response/log/sheet termigrasi.

## Sumber

- `google-apps-script/seed.gs:18-23` — versi skema dan header.
- `google-apps-script/seed.gs:25-45` — daftar 19 koleksi.
- `google-apps-script/seed.gs:63-163` — alur seed.
- `google-apps-script/seed.gs:169-302` — validasi database.
- `google-apps-script/seed.gs:314-339` — validasi Script Properties.
- `google-apps-script/seed.gs:385-431` — penulisan koleksi dan `_meta`.
- `google-apps-script/code.gs:1-114` — prinsip, versi, daftar aksi, 19 koleksi, proyeksi publik, field rahasia, nama Script Properties.
- `google-apps-script/code.gs:116-186` — helper umum: error berkode, waktu, JSON, `apiSafeEqual_`, hex, base64url, sleep.
- `google-apps-script/code.gs:187-239` — `apiConfig_` dan `setupBackend` (mode direct + secret).
- `google-apps-script/code.gs:240-331` — throttling `CacheService`: guard, fail, clear, counter.
- `google-apps-script/code.gs:332-373` — hashing password HMAC-SHA512 berulang + verifikasi.
- `google-apps-script/code.gs:374-404` — token sesi + `pv` (token version).
- `google-apps-script/code.gs:405-429` — parsing request.
- `google-apps-script/code.gs:430-540` — I/O Sheets: baca/tulis koleksi, baca/perbarui `_meta`, bump rev.
- `google-apps-script/code.gs:541-597` — ID record, sanitasi secret, validasi upsert.
- `google-apps-script/code.gs:598-698` — proyeksi, filter, `takenSeats`.
- `google-apps-script/code.gs:699-751` — user/role helper, token check, driver active schedule.
- `google-apps-script/code.gs:752-822` — `doGet`, `doPost`, health, `apiDispatch_`, gerbang proxy opsional.
- `google-apps-script/code.gs:823-903` — `login` + throttle + migrasi plaintext.
- `google-apps-script/code.gs:904-1007` — `register` pelanggan/agen.
- `google-apps-script/code.gs:1008-1016` — `session`.
- `google-apps-script/code.gs:1017-1330` — `bootstrap` + filter/proyeksi per peran.
- `google-apps-script/code.gs:1331-1404` — `changePassword` + throttle + pencabutan token.
- `google-apps-script/code.gs:1405-1552` — `adminCreateUser`.
- `google-apps-script/code.gs:1553-1595` — `adminSetPassword`.
- `google-apps-script/code.gs:1596-1718` — `commit`, validasi revisi, self-delete guard, validasi batch, `apiApplyCollection_`, preservasi secret.
- `google-apps-script/appsscript.json:1-10` — manifest dan OAuth scope.
- `google-apps-script/README.md` — pemasangan, mode direct, probe CORS, kontrak API, risiko.
- `google-apps-script/local-tests/mock-harness.mjs` — 155 asersi mock test.
- `transaceh-react/src/lib/db.js:1-6` — adapter localStorage yang masih aktif.
