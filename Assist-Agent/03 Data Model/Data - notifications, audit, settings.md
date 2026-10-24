---
title: Data - notifications, audit, settings
type: catatan
area: data
tags:
  - type/note
  - area/data
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/lib/seed.js
---

# Data — `notifications`, `audit`, `settings`

## `notifications`

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | string | `NTF...` |
| `to` | string | Email penerima |
| `title` | string | Judul |
| `msg` | string | Isi |
| `ch` | string | Kanal: `app`, `WA`, `WA+Email` |
| `time` | ISO string | Waktu |
| `read` | boolean | Sudah dibaca |

- `notify()` selalu menambah ke awal array.
- Array dipotong maksimal 200 entri.
- Header menghitung notifikasi belum dibaca untuk user aktif.
- Kanal `WA`/`WA+Email` hanya label simulasi; tidak ada pengiriman nyata.

## `audit`

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | string | `LOG...` |
| `time` | ISO string | Waktu |
| `actor` | string | `email (role)` atau `guest` |
| `action` | string | Nama aksi, mis. `booking_create` |
| `detail` | string | Detail singkat |

- `audit()` menambah ke awal array.
- Array dipotong maksimal 300 entri.
- 20 entri terakhir ditampilkan di `admin/Master.jsx`.

Contoh aksi: `seed`, `register`, `booking_create`, `booking_cancel`, `ledger_hold`, `ledger_release`, `ledger_settle`, `refund_process`, `refund_paid`, `route_suspend`, `trip_update`, `seat_block`.

## `settings`

Array `{ key, value }`. Saat ini key utama:

```json
[
  {
    "key": "platformFee",
    "value": { "type": "percent", "value": 8 }
  }
]
```

- `platformFeeOf()` membaca `settings` dan fallback ke `{ type: 'percent', value: 8 }`.
- `savePlatformFee()` menulis dan mencatat audit.
- `type` bisa `percent` atau `flat`.
- `settings` berbeda dari `agencies.feeValue` (fee agen per kursi).

## `fees` (legacy)

Seed lama menulis:

```json
{ "defaultType": "percent", "defaultValue": 8 }
```

Saat ini fee platform aktif memakai `settings`, bukan `fees`. Jangan menambahkan logika baru ke `fees`; gunakan `platformFeeOf()`.

## Sumber

- `transaceh-react/src/lib/domain.js:1754-1790` — audit, notify, fee platform.
- `transaceh-react/src/lib/domain.js:1002-1120` — notifikasi approval/rejection maintenance.
- `transaceh-react/src/lib/seed.js:127-129` — contoh notifikasi, fees, audit.
- `transaceh-react/src/lib/seed.js:130` — banner (contoh koleksi lain).

Lihat [[Alur Ledger dan Settlement]] dan [[Technical Debt dan Jebakan]].
