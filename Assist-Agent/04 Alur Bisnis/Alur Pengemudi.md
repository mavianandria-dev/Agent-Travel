---
title: Alur Pengemudi
type: catatan
area: alur
tags:
  - type/note
  - area/alur
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/driver/DriverPanel.jsx
  - transaceh-react/src/driver/Tasks.jsx
  - transaceh-react/src/driver/Trips.jsx
  - transaceh-react/src/driver/Wallet.jsx
  - transaceh-react/src/driver/Profile.jsx
  - transaceh-react/src/lib/domain.js
---

# Alur Pengemudi

## Panel

`DriverPanel` punya 4 tab berbasis `view`:

| View | Isi |
| :--- | :--- |
| `driver` | Tugas Saya |
| `driver-trips` | Riwayat trip |
| `driver-wallet` | Dompet |
| `driver-profile` | Profil |

## Identitas pengemudi

`drvOfUser(user)`:

1. Cari `drivers` dengan `userEmail` sama.
2. Fallback ke driver pertama di `agencyId` yang sama.

Artinya, akun pengemudi tanpa data driver tetap bisa membuka panel, tetapi memakai data driver pertama agen.

## Tugas

Di `driver/Tasks.jsx`:

- Daftar jadwal yang ditugaskan.
- Filter tanggal dan status.
- Melihat manifest penumpang.
- **Mulai trip** → `setScheduleTripStatus(sid, 'ontrip')`.
- **Selesaikan trip** → `setScheduleTripStatus(sid, 'arrived')`.
- **Delay** → `setScheduleDelay(sid, minutes, reason, note)`.
- **Boarding** → `booking.boarded = true`.
- **Blokir kursi** → `toggleScheduleSeatBlock`.
- **Jual tiket offline** → `createDriverBooking`, lalu pembayaran dikonfirmasi `confirmDriverBookingPayment`.

## Trip

`driver/Trips.jsx` menampilkan riwayat perjalanan:

- jadwal selesai,
- penumpang,
- pendapatan,
- status delay/terlambat.

## Dompet

`driver/Wallet.jsx`:

- Menjumlahkan `ledger.ticket` per status:
  - `ditahan` = pending,
  - `layak` = siap cair,
  - `dicairkan` = sudah cair.
- Menampilkan kode booking dan rute.
- Tidak ada penarikan dana; settlement dilakukan admin.

## Profil

`driver/Profile.jsx`:

- Data pribadi, SIM, KTP, selfie, rekening.
- Status verifikasi/kelengkapan.
- Perubahan data dapat memengaruhi `driverProfileStatus()` dan kesiapan jadwal.

## Aturan penting

- Pengemudi tidak membuat jadwal; itu tugas agen.
- `Tasks` hanya menampilkan jadwal dengan `s.driverId === me.id`; `backupDriverId` tidak dipakai untuk filter tugas.
- `drvOfUser()` memakai `userEmail`, lalu fallback ke driver pertama di agen yang sama.
- Jika agen induk nonaktif, `driverParentIssue()` memblokir akses.
- Booking yang dibuat pengemudi tetap `pending` dan wajib dibayar online.
- `source: 'driver'` membuat jasa agen 0 pada `splitFare`.
- Boarding penumpang mencegah jadwal dianggap `missed` oleh lifecycle.

## Sumber

- `transaceh-react/src/driver/DriverPanel.jsx:10-23` — tab.
- `transaceh-react/src/driver/Tasks.jsx:11-16` — `drvOfUser`.
- `transaceh-react/src/driver/Tasks.jsx:448` — filter jadwal berdasarkan `driverId`.
- `transaceh-react/src/driver/Tasks.jsx:200-250` — boarding.
- `transaceh-react/src/lib/domain.js:1488-1588` — booking driver dan konfirmasi bayar.
- `transaceh-react/src/lib/domain.js:1636-1708` — status trip.
- `transaceh-react/src/driver/Wallet.jsx:8-25` — ledger driver.

Lihat [[Modul Pengemudi]] dan [[Alur Ledger dan Settlement]].
