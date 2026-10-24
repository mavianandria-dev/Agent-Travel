---
title: Alur Boarding dan No-show
type: catatan
area: alur
tags:
  - type/note
  - area/alur
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/driver/Tasks.jsx
  - transaceh-react/src/components/BlockSeatModal.jsx
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/admin/Settlement.jsx
---

# Alur Boarding dan No-show

## Manifest

Pengemudi membuka tugas lalu melihat manifest penumpang:

- nama, kursi, titik jemput, status bayar,
- tombol boarding per penumpang,
- QR tiket bisa dipindai.

Data diambil dari `bookingsOf(scheduleId)` dan `bookedPassengers()`.

## Boarding

Saat pengemudi menekan boarding:

- `booking.boarded = true`.
- Jika sudah boarding, aksi ditolak.
- Boarding relevan untuk booking aktif (`paid`/`pending`) yang belum dibatalkan; kode boarding tidak memeriksa status secara eksplisit.
- Boarding memengaruhi `syncScheduleLifecycle()`: jadwal yang lewat tetapi sudah ada penumpang boarding akan menjadi `ontrip`, bukan `missed`.

> [!warning] Boarding pada booking pending
> Secara teknis booking `pending` bisa ditandai boarding. Jika pengemudi menekan **Mulai Trip**, semua booking pending pada jadwal itu tetap dibatalkan, termasuk yang sudah boarding. Namun jika jadwal terlewat dan `syncScheduleLifecycle()` menemukan penumpang boarding, jadwal diubah `ontrip` dan booking pending ikut `ontrip` — quirk yang perlu diwaspadai.

## Blokir kursi

`toggleScheduleSeatBlock()`:

- Alasan wajib saat memblokir.
- Kursi yang sudah `paid`/`hold`/`inactive` tidak bisa diblokir.
- `blockedSeats` disimpan di jadwal.
- `seatBlockLog` menyimpan 30 riwayat.
- Agen dan pengemudi diberi notifikasi.

Blokir kursi berguna untuk kursi rusak atau kebutuhan operasional.

## No-show

No-show bukan aksi pengemudi. Admin menanganinya di `Settlement`:

1. Jadwal lewat dan masuk antrean review.
2. Admin memilih persentase refund.
3. `resolveScheduleNoShow(sid, pct)`.
4. Booking `paid` dibatalkan, `tripStatus = 'missed'`.
5. Refund dihitung dari total pembayaran.
6. Ledger belum cair → `void`.
7. Jadwal `reviewResult = 'no_show'`.

## Kasus khusus

- Penumpang sudah boarding → jangan tandai no-show.
- Booking `done` → no-show ditolak.
- Ledger sudah `dicairkan` → refund otomatis ditolak, harus manual.
- Jadwal kosong → auto-close `reviewResult = 'empty'`, tidak perlu antrean admin.

## Sumber

- `transaceh-react/src/driver/Tasks.jsx:200-250` — boarding.
- `transaceh-react/src/lib/domain.js:2295-2340` — blokir kursi (ditolak saat maintenance).
- `transaceh-react/src/lib/domain.js:2421-2518` — no-show.
- `transaceh-react/src/lib/domain.js:1536-1621` — boarding memengaruhi lifecycle; jadwal maintenance dilewati.
- `transaceh-react/src/admin/Settlement.jsx:8-120` — modal no-show.

Lihat [[Alur Siklus Jadwal]] dan [[Alur Pembatalan dan Refund]].
