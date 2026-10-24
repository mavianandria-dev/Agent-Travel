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
  - transaceh-react/src/driver/Maintenance.jsx
  - transaceh-react/src/driver/Trips.jsx
  - transaceh-react/src/driver/Wallet.jsx
  - transaceh-react/src/driver/Profile.jsx
  - transaceh-react/src/lib/domain.js
---

# Alur Pengemudi

## Panel

`DriverPanel` punya 5 tab berbasis `view`:

| View | Isi |
| :--- | :--- |
| `driver` | Tugas Saya |
| `driver-maintenance` | Ajukan/kelola maintenance armada |
| `driver-trips` | Riwayat trip |
| `driver-wallet` | Dompet |
| `driver-profile` | Profil |

## Identitas pengemudi

`drvOfUser(user)`:

1. Cari `drivers` dengan `userEmail` sama.
2. Fallback ke driver pertama di `agencyId` yang sama.

Artinya, akun pengemudi tanpa data driver tetap bisa membuka panel, tetapi memakai data driver pertama agen.

Khusus maintenance, `driverForUser(user)` dipakai **tanpa fallback**. Akun agen/admin tidak boleh dianggap pengemudi, dan pengajuan hanya boleh untuk armada tempat ia menjadi pengemudi utama atau cadangan.

## Maintenance

`driver/Maintenance.jsx`:

- Memilih armada yang tertaut ke akun (utama atau cadangan).
- Memilih tanggal mulai/selesai, maksimal 2 hari.
- Alasan wajib minimal 10 karakter.
- Menampilkan dampak: jadwal, booking lunas, booking pending, estimasi refund 100%, dan jumlah booking yang punya pengganti.
- Mengirim request `menunggu`; status armada **tidak berubah** sebelum agen menyetujui.
- Pengemudi bisa membatalkan request yang masih `menunggu`.
- Riwayat menampilkan `menunggu`, `disetujui`, `ditolak`, `dibatalkan`, dan `selesai`.

Pengemudi tidak bisa menyetujui request sendiri. Notifikasi approval/rejection dikirim ke pengemudi dan agen.

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
- `driverForUser()` dipakai maintenance tanpa fallback.
- Pengemudi hanya bisa mengajukan maintenance untuk armada yang terhubung ke dirinya, maksimal 2 hari.
- Jika agen induk nonaktif, `driverParentIssue()` memblokir akses.
- Booking yang dibuat pengemudi tetap `pending` dan wajib dibayar online.
- `source: 'driver'` membuat jasa agen 0 pada `splitFare`.
- Boarding penumpang mencegah jadwal dianggap `missed` oleh lifecycle.

## Sumber

- `transaceh-react/src/driver/DriverPanel.jsx:11-26` — tab.
- `transaceh-react/src/driver/Tasks.jsx:11-16` — `drvOfUser`.
- `transaceh-react/src/driver/Tasks.jsx:448` — filter jadwal berdasarkan `driverId`.
- `transaceh-react/src/driver/Tasks.jsx:200-250` — boarding.
- `transaceh-react/src/lib/domain.js:433-443` — `driverForUser`.
- `transaceh-react/src/lib/domain.js:833-883` — `createMaintenanceRequest`.
- `transaceh-react/src/lib/domain.js:1152-1186` — `cancelMaintenanceRequest`.
- `transaceh-react/src/lib/domain.js:2191-2294` — booking driver dan konfirmasi bayar.
- `transaceh-react/src/lib/domain.js:2341-2420` — status trip.
- `transaceh-react/src/driver/Maintenance.jsx` — halaman maintenance.
- `transaceh-react/src/driver/Wallet.jsx:8-25` — ledger driver.

Lihat [[Modul Pengemudi]] dan [[Alur Ledger dan Settlement]].
