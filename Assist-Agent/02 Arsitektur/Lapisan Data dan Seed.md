---
title: Lapisan Data dan Seed
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/seed.js
---

# Lapisan Data dan Seed

## DB layer

`src/lib/db.js` hanya dua fungsi:

```js
DB.load(key, fallback)  // localStorage.getItem('at_' + key), JSON.parse
DB.save(key, value)     // localStorage.setItem('at_' + key, JSON.stringify(value))
```

- Semua key otomatis berprefix `at_`.
- `load` mengembalikan fallback jika data kosong atau JSON rusak.
- Tidak ada validasi skema, migrasi otomatis, atau transaksi.

## Seed

`initDB()` di `src/lib/seed.js` dijalankan sekali dari `AppContext`.

- Guard utama: `at_seeded_v16`.
- Jika belum ada, dibuat data awal:
  - 16 akun demo (1 superadmin, 4 agen, 10 pengemudi, 1 pelanggan).
  - 4 agen (satu `pending`).
  - 5 armada.
  - 10 pengemudi.
  - Rute, jadwal, dan booking **kosong** — dibuat oleh agen.
  - 2 voucher, 1 review, 1 notifikasi, 1 banner.
- Jika sudah ada, seed utama dilewati.

## Migrasi

Setelah seed utama, beberapa migrasi idempoten berjalan dengan flag sendiri:

| Flag | Tujuan |
| :--- | :--- |
| `at_kyc_npwp_seed_v1` | Melengkapi KYC agen demo |
| `at_profile_kyc_sync_v1` | Sinkron profil agen dari KYC |
| `at_support_seeded_v1` | Seed tiket support demo |
| `at_seeded_v1` / `at_seeded_v2` | Migrasi data lama |
| `at_purge_seed_sched_v1` | Membersihkan jadwal seed lama |
| `at_purge_seed_routes_v1` | Membersihkan rute seed lama |
| `at_seed_compare_v1` | Menambah variasi data perbandingan |
| `at_seed_fleet_variation_v1` | Variasi armada |
| `at_seed_ajy_competition_v1` | Data kompetisi rute Aceh Jaya |
| `at_driver_identity_v1` | Identitas pengemudi |

> [!warning] Seed bukan sumber kebenaran
> Seed hanya untuk demo. Jangan mengandalkan ID atau isi seed di logika produksi.

## Koleksi yang ditulis

`users`, `agencies`, `routes`, `vehicles`, `drivers`, `schedules`, `bookings`, `payments`, `ledger`, `vouchers`, `reviews`, `notifications`, `fees`, `audit`, `banners`, `routeRequests`, `supportTickets`, `settings`.

`fees` adalah data lama; fee platform aktif dibaca dari `settings` lewat `platformFeeOf()`.

## Reset data

```js
Object.keys(localStorage).filter(k => k.startsWith('at_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

## Sumber

- `transaceh-react/src/lib/db.js:1-6`
- `transaceh-react/src/lib/seed.js:7` — `initDB()`.
- `transaceh-react/src/lib/seed.js:70-132` — seed utama.
- `transaceh-react/src/lib/seed.js:135-214` — migrasi KYC/support.
- `transaceh-react/src/lib/seed.js:221-808` — migrasi lanjutan.

Lihat [[localStorage Keys]] dan [[Data - users dan agencies]].
