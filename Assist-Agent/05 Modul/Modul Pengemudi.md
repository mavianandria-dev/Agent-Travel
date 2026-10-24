---
title: Modul Pengemudi
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/pengemudi
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/driver/DriverPanel.jsx
  - transaceh-react/src/driver/Tasks.jsx
  - transaceh-react/src/driver/Maintenance.jsx
  - transaceh-react/src/driver/Trips.jsx
  - transaceh-react/src/driver/Wallet.jsx
  - transaceh-react/src/driver/Profile.jsx
---

# Modul Pengemudi

## Tab

| Tab | Komponen | Fungsi |
| :--- | :--- | :--- |
| `driver` | `Tasks` | Tugas hari ini dan mendatang |
| `driver-maintenance` | `Maintenance` | Ajukan/kelola maintenance armada |
| `driver-trips` | `Trips` | Riwayat trip |
| `driver-wallet` | `Wallet` | Pendapatan |
| `driver-profile` | `Profile` | Data pribadi dan dokumen |

## Tugas

- Daftar jadwal yang ditugaskan.
- Manifest penumpang.
- Mulai trip (`ontrip`).
- Delay keberangkatan.
- Boarding penumpang.
- Blokir/buka kursi dengan alasan.
- Jual tiket offline.
- Selesaikan trip (`arrived`).

## Maintenance

- Pilih armada yang terhubung sebagai pengemudi utama/cadangan.
- Periode maksimal 2 hari, alasan minimal 10 karakter.
- Pratinjau dampak jadwal, booking lunas/pending, refund 100%, dan ketersediaan pengganti.
- Kirim ke agen; status armada tetap `aktif` sampai approval.
- Batalkan request yang masih `menunggu`.
- Riwayat semua status dan ringkasan hasil approval.

## Trip

- Riwayat perjalanan.
- Status `arrived`/`missed`/`cancelled`.
- Detail pendapatan per trip.

## Dompet

- Total `ditahan`, `layak`, `dicairkan`.
- Daftar ledger per booking.
- Tidak ada tombol tarik dana.

## Profil

- Data pribadi, SIM, KTP, selfie, rekening.
- Status verifikasi.
- Perubahan data dapat memblokir penugasan jika belum lengkap.

## Batasan

- Tidak bisa membuat jadwal atau rute.
- Hanya melihat data agen sendiri.
- Tidak bisa menangani refund; refund oleh agen/admin.
- Tidak bisa mengubah status `missed`; itu otomatis/admin.
- Jika agen induk nonaktif, akses diblokir.

## Sumber

- `transaceh-react/src/driver/DriverPanel.jsx:11-26`
- `transaceh-react/src/driver/Tasks.jsx:11-16, 200-250, 468-546`
- `transaceh-react/src/driver/Maintenance.jsx:27-172`
- `transaceh-react/src/driver/Wallet.jsx:15-25`
- `transaceh-react/src/lib/domain.js:95-107` - `driverParentIssue`.
- `transaceh-react/src/lib/domain.js:433-443` - `driverForUser`.
- `transaceh-react/src/lib/domain.js:833-883` - `createMaintenanceRequest`.
- `transaceh-react/src/lib/domain.js:1152-1186` - `cancelMaintenanceRequest`.
- `transaceh-react/src/lib/domain.js:2341-2420` - status trip.

Lihat [[Alur Pengemudi]] dan [[Alur Boarding dan No-show]].
