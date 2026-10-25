# TransAceh — Google Apps Script Database

Folder ini berisi backend Google Sheets untuk TransAceh. Tahap **seed produksi minimal** di `seed.gs` sudah tervalidasi pengguna. `code.gs` kini berisi API **mode direct**: browser memanggil Web App `/exec` langsung, tanpa Cloudflare Worker atau proxy database.

> [!important] Frontend belum terhubung
> Aplikasi React masih memakai `localStorage` sampai Fase B–D selesai. Jangan mencampur mode lokal dan remote. Jangan menyimpan data pelanggan/KYC nyata sebelum probe CORS dan adapter frontend lulus uji.

## Status

| Bagian | Status |
| :--- | :--- |
| Skema tab dan seed produksi | Selesai, tervalidasi di spreadsheet nyata |
| Superadmin awal | Selesai |
| Validasi struktur database | Selesai |
| API `code.gs` mode direct | Selesai — 155 asersi mock lokal hijau |
| Proyeksi publik & filter baris per peran | Selesai di backend |
| Aksi akun (`register`, `adminCreateUser`, `adminSetPassword`) | Selesai di backend |
| Throttling login/ganti password/registrasi | Selesai (best effort) |
| Uji CORS dari browser | **Belum** — perlu deploy dan probe |
| Deploy Web App | Belum — dilakukan pengguna |
| Adapter frontend ke Sheets | Belum — Fase B |
| Proxy database | **Tidak dipakai** |

Sampai adapter frontend selesai, sumber data aktif tetap `localStorage`. `code.gs` siap dipasang, tetapi belum dipanggil aplikasi.

## Peringatan keamanan

Spreadsheet akan menyimpan data operasional. Password superadmin dari seed masih plaintext pada field `pass` sampai login pertama via API menggantinya menjadi `passHash` otomatis.

- Jangan membagikan spreadsheet dengan akses publik.
- Jangan mengaktifkan “Anyone with the link” pada file spreadsheet.
- Web App memang publik (`Anyone`), tetapi spreadsheet tetap privat. URL Web App adalah gerbang akses; jangan menyebarkannya.
- Jangan menaruh password di source code, README, atau chat.
- `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, `TOKEN_TTL`, dan `API_PROXY_KEY` hanya di Script Properties. Secret tidak pernah dicetak.
- Jangan memasukkan KYC, NIK, rekening, atau data pelanggan nyata sebelum probe CORS dan Fase B–C selesai. Proyeksi publik sudah ada di backend, tetapi belum diuji end-to-end dari frontend.
- Frontend React **masih** membandingkan password di browser. Jangan memakai akun nyata sebelum login memakai `token` server.
- Buat salinan spreadsheet sebelum reset atau perubahan besar.

Google Sheets bukan database transaksional. Validasi kapasitas kursi, pembayaran, dan konkurensi **belum** ditangani di server. Lihat bagian **Batasan dan risiko produksi**.

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
4. Buat file `code.gs`; salin isi `google-apps-script/code.gs`.

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

Salin URL `/exec`. Jangan memakai URL `/dev` untuk produksi.

### 8. Probe CORS dari origin aplikasi

Ini langkah wajib sebelum menyentuh frontend. Jalankan dari console browser di **origin GitHub Pages** (bukan `script.google.com`) dan juga dari origin dev Vite:

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
{"ok":true,"data":{"service":"transaceh-db","version":"1.1.0","schemaVersion":"1","now":"..."}}
```

Catatan:

- `Content-Type: text/plain;charset=utf-8` sengaja dipakai agar browser tidak mengirim preflight `OPTIONS`; Apps Script tidak menangani `OPTIONS`.
- Apps Script mengalihkan `/exec` ke `script.googleusercontent.com`. Yang dinilai adalah apakah respons akhir bisa dibaca JavaScript.
- Jika muncul CORS error atau body tidak terbaca, **berhenti**. Jangan lanjut ke Fase B. Pilih host proxy serverless lain, lalu set `REQUIRE_PROXY_KEY=true` dan isi `API_PROXY_KEY` di proxy tersebut.
- Uji juga login dengan akun uji setelah probe health, untuk memastikan POST body JSON benar-benar sampai.

### 9. Uji lokal sebelum deploy

```bash
node google-apps-script/local-tests/mock-harness.mjs
```

Harness mem-mock `SpreadsheetApp`, `PropertiesService`, `LockService`, `Utilities`, `CacheService`, `ContentService`, dan `Logger`. Saat ini **155 asersi** lulus.

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
- Jika klien mengirim `proxyKey`, nilainya tetap harus cocok dengan `API_PROXY_KEY`. Ini mencegah salah konfigurasi.
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
| `pengemudi` | `routes`, `agencies` (publik), `reviews` (publik), `settings`, `drivers` (dirinya penuh + rekan sesama jadwal minimal), `schedules` (ditugaskan), `bookings` (jadwalnya), `vehicles` (jadwalnya), `maintenanceRequests` (miliknya), `notifications` (miliknya + `all`), `users` (dirinya), `audit` (miliknya) |
| `pelanggan` | `banners`, `routes`, `reviews`, `agencies` (publik), `vehicles` (publik), `schedules` (publik + `takenSeats`), `settings`, `vouchers`, `bookings` (miliknya), `payments` (booking miliknya), `notifications` (miliknya + `all`), `supportTickets` (miliknya), `users` (dirinya), `audit` (miliknya) |
| tanpa token (`publik`) | `banners`, `routes`, `reviews`, `agencies`, `vehicles`, `schedules` |

Proyeksi publik:

- `agencies`: tanpa `kyc`, `bank`, `rekeningNo`, dokumen, dan field internal. Field tampil: `id`, `name`, `logo`, `photo`, `address`, `phone`, `wa`, `email`, `rating`, `trips`, `status`, `serviceFee`, `feeType`, `feeValue`, `refundPolicy`, `description`.
- `vehicles`: tanpa data pemilik (`ownerName`, `ownerNik`, `ownerPhone`), dokumen (`stnkPhoto`), `chassis`, `engine`, pajak/KIR, dan `coopDriverId`. `plate`, `layout`, `inactiveSeats`, dan fasilitas tetap ada.
- `schedules`: tanpa `driverId`, `driverName`, `backupDriverId`, `backupName`; ditambah `takenSeats`.
- `banners`, `routes`, dan `reviews` dikirim apa adanya (tetap melewati penyaring field rahasia). Agensi `pending` tidak masuk katalog publik; jadwal/armada/ulasan milik agensi pending juga disaring.
- `takenSeats` = kursi booking `paid`/`done`/`pending` + `blockedSeats` + `inactiveSeats` kendaraan, terurut. Frontend publik tidak menerima record booking (yang berisi data penumpang).

`revisions` per koleksi ikut dikirim dan dipakai sebagai `baseRev` saat commit:

```json
{ "records": { "routes": [...] },
  "revisions": { "routes": 3 } }
```

### Aksi akun

- `register` — publik. Role hanya `pelanggan` atau `agen`. Password minimal **8** karakter; nama, email, dan nomor HP divalidasi. Pelanggan langsung mendapat token. Agen membuat agensi + user berstatus `pending`, tanpa token; login ditolak sampai diaktifkan superadmin. Registrasi dibatasi 30 permintaan/jam secara global (best effort).
- `login` — memverifikasi `passHash` (HMAC-SHA512 berulang, salt + pepper). User legacy dengan `pass` plaintext dimigrasi otomatis pada login pertama; `rev.users` dinaikkan. Akun `pending`/`suspended` ditolak.
- `changePassword` — password lama wajib benar; password baru minimal 8 dan berbeda. Setelah berhasil, `tokenVersion` naik sehingga token lama langsung tidak berlaku.
- `adminCreateUser` — hanya superadmin. Role `agen`, `pengemudi`, atau `pelanggan`. Aturan: satu agensi satu akun agen; akun pengemudi harus cocok dengan `drivers.userEmail` dan agensinya sudah punya akun agen aktif; agensi pending memaksa status user `pending`; pengemudi nonaktif tidak boleh punya jadwal aktif. Email unik lintas user.
- `adminSetPassword` — hanya superadmin. Password baru minimal 8; `tokenVersion` naik sehingga sesi lama user tersebut dicabut.

Semua aksi akun memegang `LockService` dan menaikkan `rev.<koleksi>` yang ditulis, supaya commit klien yang masih memakai revisi lama tidak menimpa perubahan server.

### Aksi `commit`

Hanya `superadmin`. Format:

```json
{
  "changes": {
    "routes": { "baseRev": 3, "upserts": [ {"id":"r_1","name":"Banda Aceh - Takengon"} ], "deletes": [] },
    "users":  { "baseRev": 1, "upserts": [], "deletes": ["u_id_yang_hapus"] }
  }
}
```

Aturan server-side:

1. Koleksi harus termasuk 19 koleksi skema.
2. `baseRev` harus persis `rev.<koleksi>` di `_meta`; tidak cocok → `REV_CONFLICT`.
3. Upsert harus objek dengan `id` (atau `key` untuk `settings`/`fees`), tanpa field rahasia, tanpa ID duplikat, JSON ≤ 45000 karakter.
4. Delete diproses sebelum upsert; record yang tidak disebut tetap utuh; record baru ditambahkan di akhir; urutan lama dipertahankan.
5. Field password (`pass*`, `tokenVersion`) yang tidak dikirim klien **dipertahankan** dari record lama. Ini mencegah commit profil user menghapus hash password.
6. Superadmin tidak boleh menghapus akunnya sendiri lewat `commit`.
7. Semua perubahan dalam satu request di bawah satu `LockService`; `_meta.rev` ditulis setelah tab selesai.

**Belum ada validasi kapasitas kursi, status jadwal, atau pembayaran di `commit`.** Jangan menulis `bookings`/`payments` lewat commit sampai validasi domain server-side dibuat. Multi-koleksi belum benar-benar atomik: jika tab kedua gagal, tab pertama bisa sudah berubah tetapi `_meta.rev` belum diperbarui.

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

`PROXY_FORBIDDEN`, `UNAUTHORIZED`, `ACCOUNT_BLOCKED`, `FORBIDDEN`, `VALIDATION`, `RATE_LIMITED`, `NOT_FOUND`, `REV_CONFLICT`, `LOCK_TIMEOUT`, `SETUP_REQUIRED`, `SHEET_NOT_FOUND`, `DATA_CORRUPT`, `SPREADSHEET_UNAVAILABLE`, `UNSUPPORTED_ACTION`.

## Uji lokal

```bash
node google-apps-script/local-tests/mock-harness.mjs
```

155 asersi mencakup:

1. `setupBackend` + mode direct + `REQUIRE_PROXY_KEY`.
2. Login legacy → migrasi hash; login kedua via hash; token tamper/expired; token lama dicabut setelah ganti/reset password.
3. `bootstrap` superadmin/publik/agen/pengemudi/pelanggan; proyeksi tanpa KYC/NIK/rekening; filter baris; `takenSeats`; agensi pending.
4. `commit`: upsert/delete/konflik/role/ID duplikat/field rahasia/self-delete; hash password bertahan saat commit profil.
5. `changePassword` dan throttle login/ganti password.
6. `register` pelanggan/agen, validasi password/telepon/duplikat, agen pending.
7. `adminCreateUser`/`adminSetPassword`, aturan agen/pengemudi, pencabutan token.
8. `doGet`/`doPost`, body bukan JSON, `proxyKey` salah.
9. Tidak ada secret/plaintext password di response, log, atau sheet akun yang sudah dimigrasi.

## Batasan dan risiko produksi

1. **CORS belum terbukti.** Probe langkah 8 wajib. Jika gagal, jangan lanjut tanpa proxy.
2. **Frontend masih lokal.** Login React masih membandingkan password di browser; jangan pakai akun/data nyata sebelum Fase B.
3. **Validasi booking belum server-side.** `commit` belum mencegah dua pelanggan memesan kursi yang sama, harga tidak sesuai, atau pembayaran ganda. Ini harus selesai sebelum Fase C menulis booking.
4. **Multi-koleksi tidak atomik.** Commit kecil per koleksi lebih aman. Jika tab gagal di tengah, periksa `_meta.rev` dan data sebelum mengulang.
5. **Bootstrap membaca banyak data.** `takenSeats` menghitung dari seluruh booking pada setiap bootstrap publik. Pantau performa dan kuota Apps Script saat data bertambah.
6. **CacheService best effort.** Throttle bisa hilang saat cache dibersihkan; rate limit per IP di proxy tetap diperlukan.
7. **Password 2000 iterasi** adalah kompromi batas CPU Apps Script. Jika pindah backend, naikkan parameter KDF.
8. **Bank agensi tidak ada di proyeksi publik.** Instruksi transfer perlu aksi khusus yang hanya mengembalikan rekening tujuan untuk booking milik pelanggan (Fase C).
9. **Registrasi/aksi admin belum menulis audit atau notifikasi selamat datang.** Frontend tidak boleh menulis koleksi itu lewat commit; tambahkan di aksi server pada Fase C jika paritas fitur diperlukan.
10. **Web App URL bersifat publik.** Siapa pun yang memilikinya bisa mencoba `register`/`login`. Lindungi dengan password kuat, throttle, dan pemantauan.
11. **Pembayaran masih simulasi.** Jangan memproses uang nyata sebelum gateway dan rekonsiliasi ditambahkan.
12. **Backup manual.** Buat salinan spreadsheet berkala; jangan mengandalkan undo/version history saja.

## Langkah berikutnya

1. Deploy `code.gs`, jalankan `setupBackend()`, lalu probe CORS dari origin produksi. Jika gagal, pilih proxy alternatif sebelum melanjutkan.
2. **Fase B** — adapter baca frontend: `sheetsApi.js`, bootstrap async di `main.jsx`/`AppContext`, token sesi, `DB.load` dari cache memori. Frontend tetap tidak menulis remote.
3. **Fase C** — aksi tulis per peran + validasi booking/kursi/pembayaran server-side; audit/notifikasi; akses rekening agensi yang aman.
4. **Fase D** — pindahkan semua peran sekaligus ke `VITE_DATA_MODE=sheets`; hapus jalur localStorage untuk data aplikasi. Pertahankan `localStorage` hanya untuk `session`, `lang`, draft checkout, dan identitas guest support.
5. Uji dengan spreadsheet uji dan data sintetis sebelum data nyata.

Lihat `Assist-Agent/02 Arsitektur/Database Google Sheets.md` untuk catatan arsitektur dan `Assist-Agent/08 Jurnal/2026-10-25 - Sesi 6.md` untuk keputusan mode direct.
