---
title: localStorage Keys
type: referensi
area: data
tags:
  - type/reference
  - area/data
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/lib/checkoutDraft.js
  - transaceh-react/src/lib/support.js
  - google-apps-script/seed.gs
---

# localStorage Keys

## Prefix

`DB.save(key, value)` menulis ke `localStorage` dengan nama `at_` + `key`.
`DB.load(key, fallback)` membaca key yang sama.

> [!info] Ini sumber data yang masih aktif
> Google Sheets tahap seed memakai nama koleksi yang sama, tetapi belum terhubung ke aplikasi. Lihat [[Database Google Sheets]].

## Koleksi data

| Key | Tipe | Isi |
| :--- | :--- | :--- |
| `at_users` | array | Akun semua peran |
| `at_agencies` | array | Profil agen |
| `at_routes` | array | Rute |
| `at_routeRequests` | array | Usulan rute |
| `at_vehicles` | array | Armada |
| `at_drivers` | array | Pengemudi |
| `at_schedules` | array | Jadwal |
| `at_maintenanceRequests` | array | Pengajuan maintenance armada berbasis periode |
| `at_bookings` | array | Booking |
| `at_payments` | array | Pembayaran |
| `at_ledger` | array | Ledger pendapatan |
| `at_vouchers` | array | Voucher |
| `at_reviews` | array | Ulasan |
| `at_notifications` | array | Notifikasi |
| `at_audit` | array | Audit log |
| `at_banners` | array | Banner |
| `at_supportTickets` | array | Tiket bantuan |
| `at_settings` | array | Pengaturan global |
| `at_fees` | object | Fee lama (legacy) |

## Key sesi dan UI

| Key | Tipe | Isi |
| :--- | :--- | :--- |
| `at_session` | object | `{ uid }` user yang login |
| `at_lang` | string | `id` atau `en` |
| `at_checkout_draft` | object | `{ bw, ts }` draft checkout tamu, TTL 30 menit |
| `at_supportGuest` | object | Identitas guest untuk Pusat Bantuan |

## Flag seed dan migrasi

| Flag | Fungsi |
| :--- | :--- |
| `at_seeded_v16` | Guard seed utama |
| `at_seeded_v1`, `at_seeded_v2` | Migrasi data lama |
| `at_kyc_npwp_seed_v1` | Lengkapi KYC agen demo |
| `at_profile_kyc_sync_v1` | Sinkron profil agen dari KYC |
| `at_support_seeded_v1` | Seed tiket bantuan |
| `at_purge_seed_sched_v1` | Hapus jadwal seed lama |
| `at_purge_seed_routes_v1` | Hapus rute seed lama |
| `at_seed_compare_v1` | Data perbandingan |
| `at_seed_fleet_variation_v1` | Variasi armada |
| `at_seed_ajy_competition_v1` | Data kompetisi Aceh Jaya |
| `at_driver_identity_v1` | Identitas pengemudi |

> [!tip] Mencari key aktif
> Di DevTools Console:
> ```js
> Object.keys(localStorage).filter(k => k.startsWith('at_')).sort()
> ```

## Dampak reset

Menghapus semua `at_*` akan:
- menghapus akun, booking, dan pengaturan,
- menghapus session (logout),
- memicu seed ulang saat reload,
- mengembalikan rute/jadwal/booking ke kondisi kosong.

## Sumber

- `transaceh-react/src/lib/db.js:1-6`
- `transaceh-react/src/lib/seed.js:70-132`
- `transaceh-react/src/lib/domain.js:748-780` — pembacaan request maintenance.
- `transaceh-react/src/lib/checkoutDraft.js:11-30`
- `transaceh-react/src/lib/support.js:6-7`

Lihat [[Lapisan Data dan Seed]] dan [[Database Google Sheets]].
