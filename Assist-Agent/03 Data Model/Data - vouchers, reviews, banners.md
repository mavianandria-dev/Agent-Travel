---
title: Data - vouchers, reviews, banners
type: catatan
area: data
tags:
  - type/note
  - area/data
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/pages/TicketDetail.jsx
  - transaceh-react/src/admin/Master.jsx
---

# Data — `vouchers`, `reviews`, `banners`

## `vouchers`

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `code` | string | Kode unik, uppercase |
| `type` | string | `percent` atau `flat` |
| `value` | number | Persen atau nominal |
| `maxDisc` | number | Batas diskon untuk tipe persen |
| `quota` | number | Kuota pemakaian |
| `used` | number | Sudah dipakai |
| `active` | boolean | Aktif/tidak |
| `desc` | string | Deskripsi |

### Perhitungan

`calcDiscount(voucher, scheduleId, seatCount)` di `Search.jsx`:

- Cari voucher aktif berdasarkan kode.
- Tolak jika `used >= quota`.
- `percent`: `min(subtotal * value / 100, maxDisc)`.
- `flat`: `min(value, subtotal)`.

Saat booking dibuat, `used` dinaikkan. Saat booking dibatalkan/kedaluwarsa, `restoreVoucher()` mengembalikan kuota.

## `reviews`

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | string | `RV...` |
| `agencyId` | string | Agen yang diulas |
| `user` | string | Nama penilai |
| `rating` | number | 1–5 |
| `text` | string | Ulasan |
| `date` | `YYYY-MM-DD` | Tanggal |
| `trip` | string | Label rute |

Ulasan dibuat dari `TicketDetail` setelah perjalanan selesai. Booking juga menyimpan `rating` agar tidak mengulas dua kali.

## `banners`

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | string | `B...` |
| `title` | string | Judul |
| `sub` | string | Subjudul |
| `active` | boolean | Tampil di beranda |

Admin dapat mengaktifkan/menonaktifkan banner di `Master`.

## Sumber

- `transaceh-react/src/lib/seed.js:125-130` — contoh voucher, review, banner.
- `transaceh-react/src/pages/Search.jsx:41-51` — `calcDiscount`.
- `transaceh-react/src/pages/Search.jsx:279-281` — increment `used`.
- `transaceh-react/src/lib/domain.js:1902-1915` — `restoreVoucher`.
- `transaceh-react/src/pages/TicketDetail.jsx:48-61` — submit review.
- `transaceh-react/src/admin/Master.jsx:44` — toggle banner.

Lihat [[Alur Booking dan Checkout]].
