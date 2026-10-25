# TransAceh — Google Apps Script Database

Folder ini berisi backend Google Sheets untuk TransAceh. `seed.gs` membuat database produksi minimal; `code.gs` adalah Web App API **mode direct**: browser memanggil `/exec` langsung, tanpa Cloudflare Worker atau proxy database.

> [!important] Status integrasi
> Adapter frontend mode Sheets sudah ada (`VITE_DATA_MODE=sheets`), tetapi Web App yang ter-deploy masih versi lama dan **belum mendukung `sync`**. Jangan mengaktifkan mode Sheets di produksi sebelum `code.gs` versi **1.2.0** di-deploy, CORS diuji dari browser, dan alur tulis per peran diuji end-to-end.
>
> Jangan menyimpan data pelanggan/KYC nyata sebelum seluruh gerbang itu lulus.

## Status

| Bagian | Status |
| :--- | :--- |
| Skema tab dan seed produksi | Selesai, tervalidasi di spreadsheet nyata |
| Superadmin awal | Selesai |
| Validasi struktur database | Selesai |
| API `code.gs` mode direct | Selesai — **265 asersi mock lokal hijau** |
| Proyeksi publik & filter baris per peran | Selesai di backend |
| Aksi akun (`register`, `adminCreateUser`, `adminSetPassword`) | Selesai di backend |
| Throttling login/ganti password/registrasi | Selesai (best effort) |
| Adapter frontend baca/tulis | Selesai di kode, belum aktif secara default |
| Uji CORS dari browser | **Belum** — perlu deploy dan probe |
| Deploy Web App versi 1.2.0 | Belum — dilakukan pengguna |
| Proxy database | **Tidak dipakai** |
| Media/KYC base64 | **Belum layak** — lihat batasan |

`code.gs` di repo ini sudah siap dipasang. Deployment yang ada saat catatan ini dibuat masih `1.1.0` dan menolak aksi `sync`; jangan menganggap kode lokal sudah aktif di produksi.

## Peringatan keamanan

Spreadsheet akan menyimpan data operasional. Password superadmin dari seed masih plaintext pada field `pass` sampai login pertama via API menggantinya menjadi `passHash` otomatis.

- Jangan membagikan spreadsheet dengan akses publik.
- Jangan mengaktifkan “Anyone with the link” pada file spreadsheet.
- Web App memang publik (`Anyone`), tetapi spreadsheet tetap privat. URL Web App adalah gerbang akses; jangan disebarkan.
- Jangan menaruh password, token, pepper, atau secret di source code, README, atau chat.
- `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, `TOKEN_TTL`, dan `API_PROXY_KEY` hanya di Script Properties.
- Jangan memasukkan KYC, NIK, rekening, atau data pelanggan nyata sebelum deploy, probe CORS, dan uji end-to-end selesai.
- Frontend mode Sheets memakai token server; mode lokal masih membandingkan password di browser. Jangan mencampur mode.
- Buat salinan spreadsheet sebelum reset atau perubahan besar.

Google Sheets bukan database transaksional. `sync` memegang `LockService` dan memvalidasi revisi, kepemilikan, nominal, status, serta kursi, tetapi multi-koleksi belum benar-benar atomik. Lihat bagian **Batasan dan risiko produksi**.

## Prasyarat

1. Spreadsheet baru dan kosong.
2. Akses edit ke spreadsheet.
3. File `seed.gs`, `code.gs`, dan `appsscript.json` dari folder ini.
4. Nilai Script Properties untuk admin pertama.

## Pemasangan

### 1. Buka Apps Script

Dari spreadsheet: **Extensions → Apps Script**. Script terikat ke spreadsheet sehingga `SpreadsheetApp.getActiveSpreadsheet()` dapat dipakai tanpa spreadsheet ID.

### 2. Tambahkan file

1. Buat file script `seed.gs`; salin isi `google-apps-script/seed.gs`.
2. Buka **Project Settings** dan tampilkan `appsscript.json`.
3. Salin `google-apps-script/appsscript.json` ke manifest.
4. Buat file `code.gs`; salin isi `google-apps-script/code.gs` versi terbaru.

### 3. Isi Script Properties seed

**Project Settings → Script Properties**:

| Property | Contoh | Aturan |
| :--- | :--- | :--- |
| `ADMIN_NAME` | `Nama Admin` | Minimal 2 karakter |
| `ADMIN_EMAIL` | `admin@domainanda.com` | Email valid, disimpan lowercase |
| `ADMIN_PHONE` | `0812xxxxxxx` | 8–15 digit |
| `ADMIN_PASSWORD` | password acak | Minimal 12 karakter |

Jangan gunakan password yang sama dengan akun lain. Jangan mengirim password ke chat atau menyimpannya di repository. Spasi di awal/akhir password ditolak.

### 4. Jalankan seed

Pilih `seedProduction` → **Run** → setujui authorization → pastikan log `ok: true`. Seed juga tersedia dari menu **TransAceh → Isi seed produksi**.

### 5. Validasi

Jalankan **TransAceh → Validasi database** atau `validateDatabase()`. Hasil yang diharapkan:

- `ok: true`
- `users: 1`, `settings: 1`, `fees: 1`, `audit: 1`
- 19 tab koleksi + `_meta`
- tidak ada masalah header, JSON, ID duplikat, atau `ord` duplikat

### 6. Siapkan secret backend

Jalankan `setupBackend()` **sekali** dari editor Apps Script. Fungsi ini membuat:

- `API_TOKEN_SECRET`
- `PASSWORD_PEPPER`
- `TOKEN_TTL` (default `43200` detik = 12 jam)
- `API_PROXY_KEY` (opsional, dipertahankan untuk mode proxy di masa depan)
- `REQUIRE_PROXY_KEY=false`

Secret yang sudah ada tidak ditimpa. Jika `REQUIRE_PROXY_KEY` pernah diset `true`, ubah ke `false` untuk mode direct.

### 7. Deploy Web App

**Deploy → New deployment → Web app**:

- **Execute as**: `Me`
- **Who has access**: `Anyone`

Salin URL `/exec`, bukan `/dev`. Setelah mengganti `code.gs`, buat **versi deployment baru** atau edit deployment agar versi terbaru yang dipakai.

### 8. Probe CORS dari origin aplikasi

Ini langkah wajib sebelum mengaktifkan `VITE_DATA_MODE=sheets`. Jalankan dari console browser di **origin GitHub Pages** (bukan `script.google.com`) dan juga dari origin dev Vite:

```js
const URL = 'https://script.google.com/macros/s/XXXX/exec';

fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'health' })
})
  .then(async (r) => console.log(r.status, r.type, await r.text()))
  .catch(console.error);
```

Hasil yang diharapkan:

```json
{"ok":true,"data":{"service":"transaceh-db","version":"1.2.0","schemaVersion":"1","now":"..."}}
```

Catatan:

- `Content-Type: text/plain;charset=utf-8` sengaja dipakai agar browser tidak mengirim preflight `OPTIONS`; Apps Script tidak menangani `OPTIONS`.
- Apps Script mengalihkan `/exec` ke `script.googleusercontent.com`. Yang dinilai adalah apakah respons akhir bisa dibaca JavaScript.
- Jika muncul CORS error atau body tidak terbaca, **berhenti**. Jangan aktifkan mode Sheets. Pilih host proxy serverless lain, lalu set `REQUIRE_PROXY_KEY=true` dan isi `API_PROXY_KEY` di proxy tersebut.
- Setelah health, uji `login`, `bootstrap`, dan `sync` dengan akun uji.

### 9. Uji lokal sebelum deploy

```bash
node google-apps-script/local-tests/mock-harness.mjs
```

Harness mem-mock `SpreadsheetApp`, `PropertiesService`, `LockService`, `Utilities`, `CacheService`, `ContentService`, dan `Logger`. Saat ini **265 asersi** lulus.

## Struktur tab

`_meta`, `users`, `agencies`, `routes`, `routeRequests`, `vehicles`, `drivers`, `schedules`, `maintenanceRequests`, `bookings`, `payments`, `ledger`, `vouchers`, `reviews`, `notifications`, `audit`, `banners`, `supportTickets`, `settings`, `fees`.

### Tab `_meta`

Kolom `key`, `value`. Isi awal: `schemaVersion`, `seedVersion`, `seededAt`, `seededBy`, `databaseMode`, `collectionCount`, `collections`, `lastMutationAt`, `seedSource`, dan `rev.<koleksi>` untuk setiap koleksi.

### Tab koleksi

| Kolom | Isi |
| :--- | :--- |
| `id` | ID record; `key` untuk `settings`; `fees` untuk record legacy |
| `ord` | Urutan record di dalam array |
| `json` | Object record lengkap |
| `updated_at` | Waktu update ISO-8601 |

Satu baris = satu record. Nested data seperti KYC, layout kursi, penumpang, dan pesan support tetap di dalam JSON. Jangan mengganti nama tab/header atau mengedit `_meta` manual. Edit manual hanya untuk pemulihan darurat setelah backup.

## Data awal

Seed produksi hanya membuat satu user `superadmin`, satu `settings.platformFee`, satu record legacy `fees`, dan satu audit `seed_production`. Tidak ada agen, armada, rute, jadwal, booking, pembayaran, voucher, review, banner, atau tiket contoh.

## API `code.gs`

Semua fungsi/konstanta diawali `api`/`API_` agar tidak bentrok dengan `seed.gs` di scope global Apps Script.

### Mode direct dan proxy opsional

- Default: `REQUIRE_PROXY_KEY=false`. Browser boleh memanggil tanpa `proxyKey`.
- Jika klien mengirim `proxyKey`, nilainya tetap harus cocok dengan `API_PROXY_KEY`; ini mencegah salah konfigurasi.
- Jika `REQUIRE_PROXY_KEY=true`, semua aksi non-`health` wajib mengirim `proxyKey` yang benar. Gunakan ini hanya jika kelak ada proxy.
- `proxyKey` berada di body karena Apps Script tidak bisa membaca header request dan tidak menangani `OPTIONS`.
- Jangan pernah menaruh `proxyKey` di frontend jika mode proxy diaktifkan; simpan di proxy.

### Request dan response

POST JSON:

```json
{ "action": "login", "email": "...", "password": "...", "token": "<opsional>" }
```

Response sukses: `{ok:true, data:{...}}`. Response gagal: `{ok:false, error:{code, message}}` tanpa stack trace dan tanpa secret.

Aksi:

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

Nama aksi tidak sensitif kapital (`adminCreateUser` = `admincreateuser`). `health` juga tersedia lewat GET; GET tidak memproses aksi lain.

### Bootstrap dan proyeksi publik

Ruang baca per peran:

| Peran | Koleksi |
| :--- | :--- |
| `superadmin` | semua 19 koleksi |
| `agen` | `agencies` (miliknya penuh + agensi aktif lain terproyeksi), `routes`, `reviews`, `banners` (proyeksi), `settings`, `vehicles` (miliknya penuh + lain terproyeksi), `schedules` (miliknya penuh + lain terproyeksi), `drivers` (agensinya), `maintenanceRequests`, `routeRequests`, `bookings` (jadwal agensinya), `payments` (booking agensinya), `ledger` (agensinya), `vouchers`, `supportTickets` (agensinya/booking-nya), `notifications` (miliknya + `all`), `users` (dirinya + agen/pengemudi agensinya), `audit` (miliknya) |
| `pengemudi` | `routes`, `agencies` (publik + agensi sendiri), `reviews` (publik), `settings`, `drivers` (dirinya penuh + rekan sesama jadwal minimal), `schedules` (ditugaskan), `bookings` (jadwalnya), `vehicles` (jadwalnya, tanpa data pemilik/STNK), `maintenanceRequests` (miliknya), `notifications` (miliknya + `all`), `users` (dirinya), `audit` (miliknya) |
| `pelanggan` | `banners`, `routes`, `reviews`, `agencies` (publik), `vehicles` (publik), `schedules` (publik + `takenSeats`), `settings`, `vouchers`, `bookings` (miliknya), `payments` (booking miliknya), `notifications` (miliknya + `all`), `supportTickets` (miliknya), `users` (dirinya), `audit` (miliknya), `ledger` (booking miliknya) |
| tanpa token (`publik`) | `banners`, `routes`, `reviews`, `agencies`, `vehicles`, `schedules` |

Proyeksi publik:

- `agencies`: tanpa `kyc`, `bank`, `rekeningNo`, dokumen, dan field internal. Field tampil: `id`, `name`, `logo`, `photo`, `address`, `phone`, `wa`, `email`, `rating`, `trips`, `status`, `serviceFee`, `feeType`, `feeValue`, `refundPolicy`, `description`.
- `vehicles`: tanpa data pemilik (`ownerName`, `ownerNik`, `ownerPhone`), dokumen (`stnkPhoto`), `chassis`, `engine`, pajak/KIR, dan `coopDriverId`. `plate`, `layout`, `inactiveSeats`, dan fasilitas tetap ada.
- `schedules`: tanpa `driverId`, `driverName`, `backupDriverId`, `backupName`; ditambah `takenSeats`.
- `banners`, `routes`, dan `reviews` dikirim apa adanya (tetap melewati penyaring field rahasia). Agensi `pending` tidak masuk katalog publik; jadwal/armada/ulasan milik agensi pending juga disaring.
- `takenSeats` = kursi booking `paid`/`done`/`pending` + `blockedSeats` + `inactiveSeats` kendaraan, terurut. Frontend publik tidak menerima record booking (yang berisi data penumpang).
- Pelanggan login menerima data pengemudi minimal hanya untuk jadwal booking miliknya; jadwal publik tetap tanpa data pengemudi.

`revisions` per koleksi ikut dikirim dan dipakai sebagai `baseRev` saat `sync`/`commit`:

```json
{ "records": { "routes": [...] },
  "revisions": { "routes": 3 } }
```

### Aksi akun

- `register` — publik. Role hanya `pelanggan` atau `agen`. Password minimal **8** karakter; nama, email, dan nomor HP divalidasi. Pelanggan langsung mendapat token. Agen membuat agensi + user berstatus `pending`, tanpa token; login ditolak sampai diaktifkan superadmin. Registrasi dibatasi 30 permintaan/jam secara global (best effort).
- `login` — memverifikasi `passHash` (HMAC-SHA512 berulang, salt + pepper). User legacy dengan `pass` plaintext dimigrasi otomatis pada login pertama; `rev.users` dinaikkan. Akun `pending`/`suspended` ditolak, kecuali agen pending yang boleh login hanya untuk melengkapi KYC.
- `changePassword` — password lama wajib benar; password baru minimal 8 dan berbeda. Setelah berhasil, `tokenVersion` naik sehingga token lama langsung tidak berlaku.
- `adminCreateUser` — hanya superadmin. Role `agen`, `pengemudi`, atau `pelanggan`. Aturan: satu agensi satu akun agen; akun pengemudi harus cocok dengan `drivers.userEmail` dan agensinya sudah punya akun agen aktif; agensi pending memaksa status user `pending`; pengemudi nonaktif tidak boleh punya jadwal aktif. Email unik lintas user.
- `adminSetPassword` — hanya superadmin. Password baru minimal 8; `tokenVersion` naik sehingga sesi lama user tersebut dicabut.

Semua aksi akun memegang `LockService` dan menaikkan `rev.<koleksi>` yang ditulis, supaya `sync`/`commit` klien yang masih memakai revisi lama tidak menimpa perubahan server.

### Aksi `sync` — jalur tulis per peran

`sync` adalah jalur tulis utama frontend. Format:

```json
{
  "action": "sync",
  "token": "<token>",
  "changes": {
    "bookings": {
      "baseRev": 7,
      "upserts": [ { "id": "BK-1", "...": "..." } ],
      "deletes": []
    }
  }
}
```

Aturan server:

1. `baseRev` setiap koleksi harus sama dengan `rev.<koleksi>`; jika tidak → `REV_CONFLICT`.
2. Hanya koleksi yang diizinkan untuk peran tersebut yang boleh ditulis.
3. `upserts`/`deletes` divalidasi bentuk, ID, duplikasi, field rahasia, dan ukuran JSON.
4. Server memuat referensi lintas koleksi (`users`, `agencies`, `routes`, `vehicles`, `drivers`, `schedules`, `bookings`) sebelum validasi agar relasi dalam satu batch bisa diperiksa.
5. Setelah semua koleksi divalidasi, baris ditulis di bawah satu `LockService`; `rev` dinaikkan per koleksi.
6. `apiSyncCrossValidate_` memeriksa kursi ganda, `blockedSeats`, dan kursi nonaktif pada jadwal yang tersentuh.
7. Semua validasi berjalan sebelum penulisan. Jika satu koleksi gagal, tidak ada koleksi dalam batch itu yang ditulis.
8. `sync` tidak mengizinkan `commit` generik; `commit` tetap khusus superadmin.

Validasi domain utama:

- **Bookings**: booking baru hanya `pending`; pelanggan hanya atas nama sendiri; pengemudi hanya booking `source:'driver'` dengan `createdBy` dirinya; agen tidak boleh membuat booking. Subtotal = harga jadwal × kursi; diskon harus sesuai voucher; total = subtotal − diskon; jumlah penumpang = jumlah kursi; jadwal harus masih bookable. Update hanya field operasional; total/subtotal/diskon/identitas tidak boleh berubah; status mengikuti transisi `pending→paid/cancelled`, `paid→done/cancelled`; pindah jadwal/kursi hanya lewat maintenance; refund dibatasi kebijakan agen dan status refund hanya admin.
- **Payments**: satu payment per booking; nominal baru = total booking; fee = perhitungan `splitFare`; status baru `pending`; update hanya status/fee/refund; `pending→paid/cancelled`; refund tidak boleh melebihi refund booking; pencairan/penyelesaian refund hanya admin; delete hanya superadmin.
- **Ledger**: hanya untuk booking lunas, satu ledger per booking, dan payment harus sudah `paid`; identitas jadwal/agensi/pengemudi/email/kursi harus cocok; nominal harus sama dengan `splitFare` dan total booking; status `ditahan→layak/void`, `layak→dicairkan/void`; pindah ledger hanya lewat maintenance; delete hanya superadmin.
- **Voucher**: pelanggan hanya boleh menaikkan `used`; agen hanya boleh mengubah voucher miliknya; voucher global/agen lain hanya `used`; voucher baru agen wajib punya `id` dan `agencyId`; voucher agen hanya berlaku pada jadwal agensi tersebut.
- **Routes/schedules/vehicles/drivers/maintenance**: agen hanya pada agensinya; agen tidak boleh membuat/menghapus rute, hanya menugaskan pengemudi agensinya; jadwal agen harus pada rute yang menawarkan agensinya; pengemudi hanya jadwal yang ditugaskan; kendaraan/jadwal yang masih dipakai tidak boleh dihapus; pengemudi yang masih terpasang di kendaraan/rute tidak boleh dihapus.
- **Notifikasi**: pengguna hanya boleh membuat notifikasi untuk dirinya sendiri dan menghapus miliknya; superadmin dapat mengelola semua. Notifikasi lintas pengguna belum dibuat otomatis oleh server.
- **Support tickets**: tiket baru atas nama akun sendiri, bukan guest, status `new`; pelanggan tidak boleh menempelkan `agencyId`; agen/pengemudi harus agensinya; update tiket sendiri hanya pesan/status/`updatedAt`; transisi `waiting→process`; agen boleh membalas tiket agensinya sebagai CS; pengemudi tidak boleh menghapus tiket.

### Aksi `commit`

`commit` dipertahankan sebagai jalur darurat superadmin, bukan jalur normal frontend. Format sama dengan `sync`. Aturan:

1. Koleksi harus termasuk 19 koleksi skema.
2. `baseRev` harus persis `rev.<koleksi>` di `_meta`; tidak cocok → `REV_CONFLICT`.
3. Upsert harus objek dengan `id` (atau `key` untuk `settings`/`fees`), tanpa field rahasia, tanpa ID duplikat, JSON ≤ 45000 karakter.
4. Delete diproses sebelum upsert; record yang tidak disebut tetap utuh; record baru ditambahkan di akhir; urutan lama dipertahankan.
5. Field password (`pass*`, `tokenVersion`) yang tidak dikirim klien **dipertahankan** dari record lama.
6. Superadmin tidak boleh menghapus akunnya sendiri lewat `commit`.
7. Semua perubahan dalam satu request di bawah satu `LockService`; `_meta.rev` ditulis setelah tab selesai.

`commit` **tidak** menjalankan validator domain `sync` (kapasitas, nominal, status, kepemilikan). Jangan memakai `commit` untuk menulis booking/payment/ledger kecuali dalam pemulihan darurat yang sudah diperiksa manual.

### Throttling

Berbasis `CacheService` (best effort; cache bisa hilang):

- Login: 5 kegagalan per 15 menit per email → blokir 15 menit. Login sukses menghapus hitungan.
- Ganti password: 5 kegagalan password lama → blokir 15 menit per user.
- Registrasi: 30 permintaan/jam global. Ini pengaman kasar, bukan kuota per IP.

Karena cache bersifat sementara, throttle bukan jaminan keamanan mutlak. Proxy dengan rate limit per IP tetap disarankan untuk produksi publik.

### Token sesi

- HMAC-SHA256 atas payload base64url; payload berisi `sub`, `role`, `agencyId`, `pv` (token version), `iat`, `exp`.
- TTL default 12 jam (`TOKEN_TTL`).
- `tokenVersion` disimpan di record user, tidak pernah dikirim ke klien. Ganti password/reset admin menaikkannya, sehingga token lama tidak berlaku.
- Tidak ada refresh token; pengguna login ulang setelah token kedaluwarsa.

### Kode error

`PROXY_FORBIDDEN`, `UNAUTHORIZED`, `ACCOUNT_BLOCKED`, `FORBIDDEN`, `VALIDATION`, `RATE_LIMITED`, `NOT_FOUND`, `REV_CONFLICT`, `SEAT_CONFLICT`, `LOCK_TIMEOUT`, `SETUP_REQUIRED`, `SHEET_NOT_FOUND`, `DATA_CORRUPT`, `SPREADSHEET_UNAVAILABLE`, `UNSUPPORTED_ACTION`.

## Uji lokal

```bash
node google-apps-script/local-tests/mock-harness.mjs
```

265 asersi mencakup:

1. `setupBackend` + mode direct + `REQUIRE_PROXY_KEY`.
2. Login legacy → migrasi hash; login kedua via hash; token tamper/expired; token lama dicabut setelah ganti/reset password.
3. `bootstrap` superadmin/publik/agen/pengemudi/pelanggan; proyeksi tanpa KYC/NIK/rekening; filter baris; `takenSeats`; agensi pending; pengemudi/pelanggan menerima data yang diperlukan.
4. `commit`: upsert/delete/konflik/role/ID duplikat/field rahasia/self-delete; hash password bertahan saat commit profil.
5. `sync`: kepemilikan, revisi, kursi ganda, booking/payment/ledger palsu, nominal, voucher, refund, transisi status, larangan delete, rute/armada/jadwal/pengemudi, tiket support, notifikasi, serta whitelist field untuk menutup injeksi refund/maintenance/`paidOutAt` dan penyalahgunaan data pengemudi. Hold booking baru ditentukan server (15 menit) dan tidak boleh diperpanjang; pembayaran tidak boleh lunas saat booking masih pending.
6. `changePassword` dan throttle login/ganti password.
7. `register` pelanggan/agen, validasi password/telepon/duplikat, agen pending.
8. `adminCreateUser`/`adminSetPassword`, aturan agen/pengemudi, pencabutan token.
9. `doGet`/`doPost`, body bukan JSON, `proxyKey` salah.
10. Tidak ada secret/plaintext password di response, log, atau sheet akun yang sudah dimigrasi.

## Batasan dan risiko produksi

1. **CORS belum terbukti di browser.** Probe langkah 8 wajib. Jika gagal, jangan aktifkan mode Sheets tanpa proxy.
2. **Deployment masih versi lama.** Web App `1.1.0` belum mengenal `sync`; deploy `1.2.0` dan probe ulang.
3. **Frontend belum diuji end-to-end.** Mode Sheets harus diuji per peran: publik, pelanggan, agen, pengemudi, superadmin, dan agen pending KYC.
4. **Multi-koleksi tidak atomik.** `sync` memvalidasi semua dulu, tetapi penulisan baris terjadi per tab. Jika tab kedua gagal setelah tab pertama ditulis, periksa `_meta.rev` dan data sebelum mengulang. Buat backup.
5. **Bootstrap membaca banyak data.** `takenSeats` menghitung dari seluruh booking pada setiap bootstrap publik. Pantau performa dan kuota Apps Script saat data bertambah.
6. **CacheService best effort.** Throttle bisa hilang saat cache dibersihkan; rate limit per IP di proxy tetap diperlukan.
7. **Password 2000 iterasi** adalah kompromi batas CPU Apps Script. Jika pindah backend, naikkan parameter KDF.
8. **Bank agensi tidak ada di proyeksi publik.** Instruksi transfer perlu aksi scoped yang hanya mengembalikan rekening tujuan untuk booking milik pelanggan.
9. **Notifikasi lintas pengguna belum otomatis.** `sync` hanya mengizinkan notifikasi untuk diri sendiri; notifikasi ke agen/pengemudi/superadmin dari aksi transaksi belum dibuat server. Frontend saat ini mengandalkan data transaksi dan notifikasi lokal/self.
10. **Media/KYC base64 belum layak.** Batas JSON per record 45.000 karakter dan batas sel Google Sheets 50.000 karakter; foto driver/kendaraan/KYC nyata berpotensi melebihi batas. Jangan simpan media nyata sampai ada penyimpanan Drive privat + endpoint media, kompresi, atau guard yang jelas.
11. **Web App URL bersifat publik.** Siapa pun yang memilikinya bisa mencoba `register`/`login`. Lindungi dengan password kuat, throttle, dan pemantauan.
12. **Pembayaran masih simulasi.** Jangan memproses uang nyata sebelum gateway dan rekonsiliasi ditambahkan.
13. **Backup manual.** Buat salinan spreadsheet berkala; jangan mengandalkan undo/version history saja.
14. **Lifecycle domain belum berjalan di mode Sheets.** `cleanupHolds`, `syncScheduleLifecycle`, dan `syncMaintenanceResolutions` sengaja dimatikan di `AppContext` karena memutasi data lintas pemilik. Hold kedaluwarsa, jadwal lampau, dan resolusi maintenance harus dipindahkan ke trigger Apps Script/server sebelum data nyata.

## Langkah berikutnya

1. Deploy `code.gs` versi `1.2.0`, jalankan `setupBackend()`, lalu probe `health`, `login`, `bootstrap`, dan `sync` dari browser di origin produksi.
2. Uji end-to-end mode Sheets untuk semua peran dengan data sintetis.
3. Pindahkan lifecycle (hold, jadwal, maintenance) ke trigger Apps Script atau putuskan batasan resmi sebelum data nyata.
4. Selesaikan penanganan media/KYC (Drive privat + endpoint media atau guard eksplisit) sebelum data nyata.
5. Putuskan apakah notifikasi lintas pengguna akan dibuat server-side atau tetap self-only sebagai batasan resmi.
6. Setelah lulus, ubah `VITE_DATA_MODE=sheets` dan deploy frontend. Jangan mencampur mode lokal dan Sheets.
7. Buat backup dan pantau kuota Apps Script/Sheets.

## Sumber

- `google-apps-script/seed.gs` — skema, seed produksi, validasi database.
- `google-apps-script/code.gs:1-120` — versi API, daftar aksi/koleksi, proyeksi publik, field rahasia.
- `google-apps-script/code.gs:799-1058` — `doPost`, dispatch, health, gerbang proxy.
- `google-apps-script/code.gs:1059-1744` — bootstrap dan filter per peran.
- `google-apps-script/code.gs:1745-2188` — `sync`, helper validasi, refund, voucher.
- `google-apps-script/code.gs:2189-2840` — validasi user, rute, agensi, armada, pengemudi, jadwal, maintenance.
- `google-apps-script/code.gs:2842-3381` — validasi booking, payment, ledger.
- `google-apps-script/code.gs:3382-3731` — voucher, review, notifikasi, tiket support, route request, dispatcher, validasi lintas koleksi.
- `google-apps-script/code.gs:3732-3850` — `commit`, penerapan koleksi, preservasi secret.
- `google-apps-script/appsscript.json` — manifest dan OAuth scope.
- `google-apps-script/local-tests/mock-harness.mjs` — 265 asersi mock.
- `transaceh-react/src/lib/db.js` — cache, diff, antrean sync, rollback.
- `transaceh-react/src/lib/sheetsApi.js` — transport direct.
- `transaceh-react/src/lib/remote.js` — bootstrap, login, logout, hydrate revisi.
