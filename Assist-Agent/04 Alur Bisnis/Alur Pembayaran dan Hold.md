---
title: Alur Pembayaran dan Hold
type: catatan
area: alur
tags:
  - type/note
  - area/alur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/agen/Bookings.jsx
---

# Alur Pembayaran dan Hold

## Metode simulasi

`PaymentModal` menawarkan:

- QRIS
- Virtual Account
- E-Wallet (DANA/OVO/GoPay/ShopeePay)
- Transfer bank (diverifikasi manual oleh agen)

Tidak ada integrasi payment gateway. Tombol **Simulasi: Saya Sudah Bayar** langsung menandai lunas.

## Hold 15 menit

Saat booking dibuat:

```js
holdExpiry = now + 15 menit
status = 'pending'
```

Aturan:

- `canPayBooking()` menolak pembayaran jika hold lewat, jadwal tutup, atau jadwal sudah berjalan.
- `ensureHoldExpiry()` hanya memberi hold pada booking lama yang belum punya hold; tidak memperpanjang hold yang sudah ada.
- `cleanupHolds()` berjalan setiap 10 detik:
  - booking pending yang lewat → `cancelled`,
  - payment → `cancelled`,
  - voucher dikembalikan,
  - alasan `Hold kedaluwarsa (15 mnt)`.
- Kursi hold dihitung sebagai terpakai oleh `takenSeats()` sampai dibersihkan.

## Pembayaran sukses

Alur `simulatePay()`:

1. Baca booking dari `localStorage`.
2. Validasi `canPayBooking`.
3. `status = 'paid'`, `paidAt`, `holdExpiry = null`.
4. Hitung `fare = splitFare(s, seats, discount)`.
5. Simpan booking.
6. Payment `status = 'paid'`, `fee = fare.fee`.
7. `createLedger(booking)` → ledger `ditahan`.
8. `audit`, `notify`, reset `bw`, tutup modal, arahkan ke tiket.

## Verifikasi manual oleh agen

Di `agen/Bookings.jsx`:

- `verifyPay(bid)` memakai `canPayBooking(..., { ignoreHold: true })`.
- Cocok untuk transfer yang dibayar di luar aplikasi.
- Tetap membuat `fare` dan ledger.
- Payment diubah `paid` dan `fee` disinkronkan.

## Countdown

`PaymentModal` memakai `setInterval` 1 detik:

- Menampilkan sisa waktu hold.
- Jika jadwal dibatalkan/berjalan, modal ditutup dan user diarahkan ke tiket.
- Jika hold habis, pembayaran ditutup.

## Sumber

- `transaceh-react/src/pages/Search.jsx:53-145` — modal pembayaran.
- `transaceh-react/src/pages/Search.jsx:275-277` — payment awal.
- `transaceh-react/src/lib/domain.js:1035-1061` — cleanup hold.
- `transaceh-react/src/lib/domain.js:1239-1253` — hold dan `canPayBooking`.
- `transaceh-react/src/lib/domain.js:1186-1194` — ledger.
- `transaceh-react/src/agen/Bookings.jsx:84-106` — verifikasi manual.

Lihat [[Alur Booking dan Checkout]] dan [[Alur Ledger dan Settlement]].
