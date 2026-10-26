---
title: Database Google Sheets
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-26
source:
  - google-apps-script/seed.gs
  - google-apps-script/code.gs
  - google-apps-script/appsscript.json
  - google-apps-script/README.md
  - google-apps-script/local-tests/mock-harness.mjs
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/sheetsApi.js
  - transaceh-react/src/lib/remote.js
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/lib/seed.js
---

# Database Google Sheets

## Status

Tahap **seed produksi** tervalidasi oleh pengguna di spreadsheet nyata. Backend `code.gs` mode direct mencapai versi **1.3.0** dengan **penyimpanan kolom (schema 2)**, lulus **286 asersi mock test lokal** (`google-apps-script/local-tests/mock-harness.mjs`) termasuk round-trip tulis/baca semua koleksi. Browser memanggil Web App `/exec` langsung; tidak ada Cloudflare Worker/proxy database.

Adapter frontend mode Sheets juga sudah ada: `sheetsApi.js`, `remote.js`, `db.js`, `boot.js`, `AppContext`, dan jalur tulis per peran. Namun:

- Web App yang ter-deploy masih memakai format **1 baris = 1 sel JSON (schema 1)**; tidak kompatibel dengan engine 1.3.0.
- Spreadsheet produksi harus **di-reset lalu di-seed ulang** dengan skema kolom v2; tidak ada migrasi data JSON lama.
- Deploy `code.gs` 1.3.0, probe CORS dari browser, dan uji end-to-end belum dilakukan.
- Mode default aplikasi masih perlu dijaga `local` sampai gerbang deploy lulus; jangan mencampur lokal dan Sheets.
- Lifecycle domain (`cleanupHolds`, `syncScheduleLifecycle`, `syncMaintenanceResolutions`) dimatikan di mode Sheets karena memutasi data lintas pemilik; belum ada trigger server-side.
- Data KYC/agensi nyata dan media base64 belum layak disimpan (batas per sel 45.000 karakter).

## Keputusan bentuk data (storage v2 — 1NF penuh)

- Satu spreadsheet berisi tab per **koleksi utama** (19) + **tab anak** untuk array/objek (~40) + `_meta`; daftar lengkap dari `apiDescribeStore_()` di `code.gs` (`API_MAIN_TABLES`).
- Satu record = satu baris di tab utama: `id | ord | <kolom skema> | updated_at`.
- Semua nilai disimpan sebagai teks (format sel `'@'`). Konversi saat baca per prefix kolom: tanpa prefix → string; `n:` → number; `b:` → boolean (`'true'/'false'`). Sel kosong dibaca string `''` (teks) atau `null` (angka/boolean).
- Alias kolom `src>col` dipakai bila nama field bentrok (mis. `id>msg_id` pada pesan tiket).
- Array daftar: tab anak `parent_id | slot | <kolom>` (elemen skalar memakai satu kolom `val`, flag `scalar: true`); map: `parent_id | key | ...`; objek tunggal (`kind: 'one'`): satu baris anak.
- Path anak boleh bertingkat (`kyc.alamat` → `agency_kyc_alamat`); koleksi `notifications` punya path khusus `'*'` untuk menampung field ekstra skalar ke `notifications_meta` (key–val), sedangkan koleksi lain menolak field tak dikenal dengan `VALIDATION` (anti silent data-loss).
- Array selalu dimaterialisasi `[]` saat baca (kontrak baca); map/objek anak hanya muncul bila ada baris.
- Batas isi sel `API_MAX_CELL_CHARS = 45000` (`API_MAX_JSON_CHARS` lama dihapus; tidak ada lagi kolom `json`).
- `_meta`: `key`, `value` — sekarang juga berisi `schemaVersion` (`2`), `storage` (`columns-v2`), `systemVersion`, `tableCount`.
- Revisi per koleksi tetap disimpan sebagai `rev.<koleksi>` di `_meta`; `sync`/`commit` memakai `baseRev` sebagai pesimistis-lock.
- Semua penulisan memegang `LockService.getScriptLock()`.
- Field `pass` plaintext **tidak pernah jadi kolom**; fixture/uji men-hash via `apiHashForUser_`.

## Seed produksi

Urutan wajib: `setupBackend()` dulu (pepper untuk hashing), baru `seedProduction()` — tanpa pepper seed berhenti dengan `SETUP_REQUIRED`. `seedProduction()` di `google-apps-script/seed.gs` membuat database minimal untuk operasi nyata, bukan demo, dan membuat **semua tab dari `apiDescribeStore_()`** (utama + anak + `_meta`).

| Tab | Isi |
| :--- | :--- |
| `users` | Satu akun `superadmin` dari Script Properties — password di-hash saat seeding |
| `settings` | `platformFee` default `{ type: 'percent', value: 8 }` |
| `fees` | Fee default `{ defaultType: 'percent', defaultValue: 8 }` (id `fees`) |
| `audit` | Satu entri `seed_production` |
| Tab lainnya | Header saja, tanpa record contoh |

Script Properties seed: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`. Seed tidak membuat agen, pengemudi, pelanggan, armada, rute, jadwal, booking, pembayaran, voucher, review, banner, atau tiket contoh.

## Pengamanan seed

- Script terikat ke spreadsheet aktif; tidak butuh spreadsheet ID.
- `LockService` mencegah dua seed bersamaan.
- Seed berhenti jika `_meta` sudah berisi data atau salah satu tab koleksi sudah berisi record.
- Header benar tetapi kosong boleh ditulis ulang.
- `validateDatabase()` memeriksa header per tabel terhadap skema (`apiDescribeStore_`), `id`/`ord`/`updated_at`, sel lebih dari 45000 karakter, ID/`ord`/`parent_id` duplikat, baris anak tanpa `parent_id`, membaca-ulang tiap koleksi lewat engine baca, superadmin aktif ber-hash, `settings.platformFee`, dan revisi.
- Tab `Sheet1` kosong dihapus.
- Tidak ada reset otomatis.

## Backend API `code.gs`

`code.gs` adalah Web App yang membaca/menulis tab hasil seed. Semua fungsi dan konstanta diawali `api`/`API_` agar tidak bentrok dengan `seed.gs` di scope global yang sama.

### Mode direct

- Default `REQUIRE_PROXY_KEY=false`: browser boleh memanggil tanpa `proxyKey`.
- Jika klien mengirim `proxyKey`, nilainya tetap harus cocok dengan `API_PROXY_KEY`; ini mencegah salah konfigurasi.
- `REQUIRE_PROXY_KEY=true` hanya untuk skenario proxy di masa depan.
- Alasan direct: Apps Script tidak bisa membaca header HTTP dan tidak menangani `OPTIONS`, sehingga token/gerbang harus lewat body. Dengan `Content-Type: text/plain;charset=utf-8`, browser tidak mengirim preflight.
- `setupBackend()` tetap membuat `API_PROXY_KEY` agar mode proxy bisa diaktifkan tanpa setup ulang, tetapi tidak dipakai frontend saat direct.

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
- Field `pass`/`password` bersifat **transien**: boleh dikirim lewat `sync` `users` untuk membuat akun, langsung di-hash oleh `apiSyncPrepareUsers_` dan tidak pernah ditulis ke sheet.
- Password baru (register/ganti/reset/admin create) minimal **8** karakter.
- Field rahasia (`passHash`/`passSalt`/`passIter`/`passAlgo`/`tokenVersion`) tidak pernah dikirim ke response; `commit` menolak field rahasia dan validator kolom menolak field di luar skema.

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
| `sync` | `token`, `changes` | `{touched, revisions}` | semua peran sesuai scope |
| `commit` | `token`, `changes` | `{touched, revisions}` | hanya `superadmin` |
| `changePassword` | `token`, `currentPassword`, `newPassword` | `{user}` | token valid |
| `adminCreateUser` | `token`, data akun | `{user}` | hanya `superadmin` |
| `adminSetPassword` | `token`, `userId`, `newPassword` | `{user}` | hanya `superadmin` |

### Bootstrap per peran

| Peran | Koleksi |
| :--- | :--- |
| `superadmin` | semua 19 koleksi; record `users` disanitasi |
| `agen` | agensi sendiri penuh + agensi aktif lain terproyeksi; `routes`, `reviews` (publik + miliknya), `banners` (proyeksi), `settings`, armada/jadwal sendiri penuh + lain terproyeksi, `drivers`/`maintenanceRequests`/`routeRequests`/`ledger` milik agensi, `bookings` jadwal agensi, `payments` booking tersebut, `vouchers`, `supportTickets` terkait, `notifications` miliknya + `all`, `users` dirinya + agen/pengemudi agensi, `audit` miliknya |
| `pengemudi` | `routes`, `agencies` publik + agensi sendiri, `reviews` publik, `settings`, `drivers` dirinya penuh + rekan sesama jadwal minimal (`id`,`name`,`phone`,`photo`,`rating`,`status`), jadwal yang ditugaskan, booking jadwal tersebut, kendaraan jadwal tersebut tanpa data pemilik/STNK, `maintenanceRequests` miliknya, `notifications` miliknya + `all`, `users` dirinya, `audit` miliknya |
| `pelanggan` | `banners`, `routes`, `reviews`, `agencies` publik, `vehicles` publik, `schedules` publik + `takenSeats`, `settings`, `vouchers`, booking/payment/ledger/notifikasi/tiket/audit miliknya, `users` dirinya, data pengemudi minimal untuk jadwal booking sendiri |
| tanpa token | `banners`, `routes`, `reviews`, `agencies`, `vehicles`, `schedules` publik |

### Proyeksi publik

- `agencies`: tanpa `kyc`, `bank`, `rekeningNo`, dokumen, dan field internal. Field tampil: `id`, `name`, `logo`, `photo`, `address`, `phone`, `wa`, `email`, `rating`, `trips`, `status`, `serviceFee`, `feeType`, `feeValue`, `refundPolicy`, `description`.
- `vehicles`: tanpa `ownerName`/`ownerNik`/`ownerPhone`, `stnkPhoto`, `chassis`, `engine`, pajak/KIR, dan `coopDriverId`. `plate`, `layout`, `inactiveSeats`, fasilitas tetap ada.
- `schedules`: tanpa `driverId`/`driverName`/`backupDriverId`/`backupName`; ditambah `takenSeats`.
- `banners`, `routes`, `reviews`: dikirim apa adanya, tetap melewati penyaring field rahasia.
- Agensi `pending` tidak muncul di katalog publik; jadwal/armada/ulasan milik agensi pending disaring.
- `takenSeats` = kursi booking `paid`/`done`/`pending` + `blockedSeats` + `inactiveSeats` kendaraan, terurut. Frontend publik tidak menerima record booking.
- `bank` agensi **sengaja tidak** masuk proyeksi publik. Instruksi transfer perlu aksi khusus yang hanya mengembalikan rekening tujuan untuk booking milik pelanggan.

### Aksi akun

- `register`: role hanya `pelanggan`/`agen`; validasi nama/email/telepon/password ≥ 8; pelanggan langsung token; agen membuat agensi + user `pending` tanpa token.
- `login`: verifikasi hash; migrasi plaintext; akun `pending`/`suspended` ditolak, kecuali agen pending yang boleh login hanya untuk KYC.
- `changePassword`: password lama benar, password baru ≥ 8 dan berbeda; token lama dicabut.
- `adminCreateUser`: hanya superadmin; role `agen`/`pengemudi`/`pelanggan`; satu agensi satu akun agen; pengemudi harus cocok dengan `drivers.userEmail` dan agensi sudah punya agen aktif; agensi pending memaksa user pending; pengemudi nonaktif tidak boleh punya jadwal aktif.
- `adminSetPassword`: hanya superadmin; password ≥ 8; token lama user dicabut.
- Semua aksi akun menaikkan `rev` koleksi yang ditulis agar `sync`/`commit` klien dengan revisi lama tidak menimpa perubahan server.

### `sync` — jalur tulis per peran

Frontend memakai satu aksi `sync` ter-scope, bukan menulis ulang semua call site `DB.save`. Format:

```json
{
  "action": "sync",
  "token": "<token>",
  "changes": {
    "bookings": { "baseRev": 7, "upserts": [ { "id": "BK-1" } ], "deletes": [] }
  }
}
```

Aturan:

- `baseRev` harus persis `rev.<koleksi>`; tidak cocok → `REV_CONFLICT`.
- Koleksi yang boleh ditulis bergantung peran; `commit` generik tetap superadmin-only.
- Server memuat referensi `users`, `agencies`, `routes`, `vehicles`, `drivers`, `schedules`, `bookings` sebelum validasi agar relasi lintas koleksi dalam satu batch dapat diperiksa.
- Semua validasi berjalan sebelum penulisan; jika satu koleksi gagal, tidak ada koleksi dalam batch itu yang ditulis.
- `apiSyncCrossValidate_` memeriksa kursi ganda, `blockedSeats`, dan kursi nonaktif pada jadwal yang tersentuh.
- `apiSyncPrepareUsers_` menyalin secret lama sebelum diff, sehingga record klien yang tersanitasi tidak dianggap menghapus `passHash`/`tokenVersion`; `pass`/`password` klien langsung di-hash dan menaikkan versi token.
- Perbandingan field `apiSyncChangedFields_` memakai semantik penyimpanan kolom: nilai kosong (absen/`null`/`''`) sederajat, angka vs teks-angka dibandingkan numerik (`apiSyncValueChanged_`).

Validasi domain utama:

- **Bookings**: booking baru hanya `pending`; pelanggan hanya atas nama sendiri; pengemudi hanya booking `source:'driver'` dengan `createdBy` dirinya; agen tidak boleh membuat booking. Subtotal = harga jadwal × kursi; diskon sesuai voucher; total = subtotal − diskon; jumlah penumpang = jumlah kursi; jadwal masih bookable. Update hanya field operasional; total/subtotal/diskon/identitas tidak boleh berubah; transisi `pending→paid/cancelled`, `paid→done/cancelled`; pindah jadwal/kursi hanya lewat maintenance; refund dibatasi kebijakan agen; status refund dan `refundPaidAt` hanya admin.
- **Payments**: satu payment per booking; nominal baru = total booking; fee = `splitFare`; status baru `pending`; update hanya status/fee/refund; `pending→paid/cancelled`; refund tidak melebihi refund booking; penyelesaian refund hanya admin; delete hanya superadmin.
- **Ledger**: hanya untuk booking lunas, satu ledger per booking, payment harus sudah `paid`; identitas jadwal/agensi/pengemudi/email/kursi harus cocok; nominal harus sama dengan `splitFare` dan total booking; status `ditahan→layak/void`, `layak→dicairkan/void`; pindah hanya lewat maintenance; delete hanya superadmin.
- **Voucher**: pelanggan hanya boleh menaikkan `used`; agen hanya boleh mengubah voucher miliknya; voucher global/agen lain hanya `used`; voucher baru agen wajib punya `id` dan `agencyId`; voucher agen hanya berlaku pada jadwal agensi tersebut.
- **Routes/schedules/vehicles/drivers/maintenance**: agen hanya pada agensinya; agen tidak boleh membuat/menghapus rute, hanya menugaskan pengemudi agensinya; jadwal agen harus pada rute yang menawarkan agensinya; pengemudi hanya jadwal yang ditugaskan; kendaraan/jadwal yang masih dipakai tidak boleh dihapus; pengemudi yang masih terpasang di kendaraan/rute tidak boleh dihapus.
- **Notifikasi**: pengguna hanya boleh membuat notifikasi untuk dirinya sendiri dan menghapus miliknya; superadmin dapat mengelola semua. Notifikasi lintas pengguna belum dibuat otomatis oleh server.
- **Support tickets**: tiket baru atas nama akun sendiri, bukan guest, status `new`; pelanggan tidak boleh menempelkan `agencyId`; agen/pengemudi harus agensinya; update tiket sendiri hanya pesan/status/`updatedAt`; transisi `waiting→process`; agen boleh membalas tiket agensinya sebagai CS; pengemudi tidak boleh menghapus tiket.

### `commit`

Format sama dengan `sync`, tetapi hanya superadmin dan **tidak** menjalankan validator domain `sync`. Aturan:

- Hanya `superadmin`; semua 19 koleksi diizinkan.
- `baseRev` harus persis `rev.<koleksi>`; tidak cocok → `REV_CONFLICT`.
- Upsert divalidasi: objek dengan `id` (atau `key` untuk `settings`/`fees`), tanpa field rahasia, tanpa ID duplikat, dan lolos skema kolom (`VALIDATION` untuk field tak dikenal).
- Delete sebelum upsert; urutan lama dipertahankan; record baru di akhir.
- Field password/`tokenVersion` yang tidak dikirim klien dipertahankan dari record lama.
- Superadmin tidak boleh menghapus akunnya sendiri lewat `commit`.
- Multi-koleksi belum atomik: jika tab kedua gagal, tab pertama bisa sudah berubah sementara `_meta.rev` belum diperbarui.

`commit` adalah jalur darurat. Jangan memakainya untuk booking/payment/ledger kecuali pemulihan yang sudah diperiksa manual.

## Frontend mode Sheets

- `runtime.js` menentukan mode dari `VITE_DATA_MODE`; default `local`.
- `sheetsApi.js` mengirim POST JSON `text/plain;charset=utf-8` ke `/exec`; token di body.
- `boot.js` memuat snapshot publik/token sebelum React dirender; `BootGate` menahan UI saat boot.
- `db.js` menyimpan cache optimistis, diff per koleksi, antrean debounce, `baseRev`, rollback, dan revisi. Password plaintext dihapus dari cache/snapshot user setelah sync sukses.
- `remote.js` memuat bootstrap, hydrate `records` + `revisions`, login/register/logout, dan flush sebelum logout.
- `AppContext` memasang handler error global: `REV_CONFLICT`/`SEAT_CONFLICT` memuat ulang snapshot; `UNAUTHORIZED`/`ACCOUNT_BLOCKED` membersihkan token/sesi/cache/draft checkout, kembali ke `home`, lalu memuat snapshot publik.
- `session`, `lang`, `checkout_draft`, dan `guest_support_tickets` tetap di `localStorage`; data aplikasi lain di cache remote.
- Di mode Sheets, `AppContext` tidak menjalankan `cleanupHolds`, `syncScheduleLifecycle`, atau `syncMaintenanceResolutions`. Interval lifecycle hanya aktif di mode `local` sampai ada trigger server-side yang memegang izin lintas data.

## Secret dan keamanan

- `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, `TOKEN_TTL`, `API_PROXY_KEY` dibuat `setupBackend()` di editor. Secret yang ada tidak ditimpa.
- Spreadsheet tetap privat; jangan mengaktifkan “Anyone with the link” pada file.
- Web App: **Execute as** `Me`, **Who has access** `Anyone`. URL adalah gerbang akses.
- `Content-Type` POST: `text/plain;charset=utf-8` untuk menghindari preflight.
- 286 asersi mock memeriksa secret/plaintext password tidak muncul di response/log/record akun; token tamper/kedaluwarsa; revisi basi; seat conflict; whitelist field; hold booking server-side; pembayaran harus mengikuti booking; ledger; refund; tiket support; round-trip storage v2; dan proyeksi KYC.
- Jangan menaruh token/pepper/proxy key di frontend.

## Keamanan yang belum selesai

- **CORS belum diuji dari browser.** Node probe melihat `Access-Control-Allow-Origin: *`, tetapi browser dari GitHub Pages belum diverifikasi.
- Spreadsheet terpasang masih skema JSON lama; reset + seed ulang v2 wajib sebelum dipakai.
- **Lifecycle belum server-side.** Hold kedaluwarsa, jadwal lampau, dan resolusi maintenance tidak diproses otomatis di mode Sheets. Perlu trigger Apps Script atau keputusan batasan resmi sebelum data nyata.
- Rate limit berbasis cache bisa hilang; rate limit per IP belum ada.
- Multi-koleksi belum transaksional.
- `takenSeats` membaca seluruh booking pada setiap bootstrap publik; performa perlu dipantau.
- Notifikasi lintas pengguna belum otomatis.
- Media/KYC base64 berpotensi melebihi `API_MAX_CELL_CHARS = 45000` per sel (dataUrl foto). Jangan simpan media nyata sampai ada Drive privat + endpoint media/kompresi/guard.
- Rekening agensi untuk instruksi transfer belum ada di jalur publik; perlu aksi scoped.
- `commit` tetap melewati validator domain; hanya untuk superadmin/darurat.

## Rencana integrasi

1. ~~Seed produksi + validasi database~~ — selesai.
2. ~~Backend `code.gs` mode direct: autentikasi, proyeksi publik, filter baris, aksi akun, throttle, token revocation~~ — selesai.
3. ~~Fase B: adapter baca frontend + bootstrap async + token sesi + cache memori~~ — selesai di kode.
4. ~~Fase C: `sync` ter-scope + validasi booking/kursi/payment/ledger + rollback frontend~~ — selesai di kode, 286 asersi (termasuk storage v2).
5. **Deploy + probe CORS** versi 1.3.0 dan **reset spreadsheet + seed ulang** dari origin produksi.
6. **Uji end-to-end** semua peran dengan data sintetis.
7. **Fase D**: aktifkan `VITE_DATA_MODE=sheets` setelah deploy, CORS, E2E, dan lifecycle server-side lulus; jangan mencampur mode.
8. Selesaikan media/KYC dan keputusan notifikasi lintas pengguna.
9. Sinkronkan antar-tab lewat polling/`BroadcastChannel` bila perlu.

Lihat [[Lapisan Data dan Seed]] untuk perilaku data lokal, [[Build dan Deploy]] untuk langkah deploy, dan [[Technical Debt dan Jebakan]] untuk risiko arsitektur client-only.

## Uji lokal

`google-apps-script/local-tests/mock-harness.mjs` menjalankan **286 asersi**:

1. `setupBackend` + mode direct + `REQUIRE_PROXY_KEY`.
2. Login via hash (`apiHashForUser_`); token tamper/expired; token dicabut setelah ganti/reset password.
3. `bootstrap` superadmin/publik/agen/pengemudi/pelanggan; proyeksi tanpa KYC/NIK/rekening; filter baris; `takenSeats`; agensi pending.
4. `commit`: upsert/delete/konflik/role/ID duplikat/field rahasia/self-delete; hash bertahan saat commit profil.
5. `sync`: kepemilikan, revisi, kursi ganda, booking/payment/ledger palsu, nominal, voucher, refund, transisi status, larangan delete, rute/armada/jadwal/pengemudi, tiket support, notifikasi, whitelist field.
6. `changePassword` + throttle login/ganti password.
7. `register` pelanggan/agen, validasi, agen pending.
8. `adminCreateUser`/`adminSetPassword`, aturan agen/pengemudi, pencabutan token.
9. `doGet`/`doPost`, body bukan JSON, `proxyKey` salah.
10. Round-trip storage v2: tulis ulang semua koleksi via engine, hasil baca identik; sel > 45000 karakter dan field di luar skema ditolak tanpa data loss.
11. Tidak ada secret/plaintext password di response/log/record akun.

Harness membuat semua tab dari `apiDescribeStore_()`, men-seed fixture lewat `apiWriteCollection_`, dan membaca record lewat `readRec()` (`apiReadCollection_`) — bukan dari sel JSON.

## Sumber

- `google-apps-script/seed.gs:25-29` — `DB_SCHEMA_VERSION='2'`, `DB_SEED_VERSION='production-2'`, `MAX_CELL_CHARS_`.
- `google-apps-script/seed.gs:44-173` — `requireSchema_`, alur `seedProduction_` (setupBackend dulu).
- `google-apps-script/seed.gs:194-435` — `validateDatabase` dan helper pemeriksa tabel.
- `google-apps-script/seed.gs:437-565` — util penulisan tab/`_meta`.
- `google-apps-script/code.gs:1-260` — prinsip, versi 1.3.0, daftar aksi/koleksi, proyeksi publik, field rahasia, `apiConfig_`.
- `google-apps-script/code.gs:519-845` — `API_MAIN_TABLES` (skema kolom v2 + tab anak, termasuk alias `src>col` dan `scalar`).
- `google-apps-script/code.gs:845-1200` — `apiDescribeStore_`, validator skema, engine tulis/baca, guard sel.
- `google-apps-script/code.gs:1200-1550` — `_meta`/rev, health, `doPost`, dispatch, gerbang proxy.
- `google-apps-script/code.gs:1550-2430` — login/register/bootstrap+filter per peran, ganti password, admin user.
- `google-apps-script/code.gs:2432-2980` — `apiSync_`, bentuk target, `apiSyncPrepareUsers_`, perbandingan field v2.
- `google-apps-script/code.gs:2980-3980` — validasi rute/agensi/armada/pengemudi/jadwal/maintenance/booking/payment/ledger.
- `google-apps-script/code.gs:3980-4445` — voucher, notifikasi, tiket, route request, cross-validate.
- `google-apps-script/code.gs:4445-4575` — `apiCommit_`, `apiApplyCollection_`, preservasi secret.
- `google-apps-script/appsscript.json:1-10` — manifest dan OAuth scope.
- `google-apps-script/local-tests/mock-harness.mjs` — 286 asersi mock (termasuk round-trip v2).
- `transaceh-react/src/lib/db.js:1-260` — cache, diff, antrean sync, rollback, hydrate.
- `transaceh-react/src/lib/sheetsApi.js` — transport direct dan method `sync`.
- `transaceh-react/src/lib/remote.js` — bootstrap, login, logout, hydrate revisi.
- `transaceh-react/src/store/AppContext.jsx` — handler error sync dan pembersihan sesi.
