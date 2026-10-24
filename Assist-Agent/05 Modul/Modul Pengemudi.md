---
title: Modul Pengemudi
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/pengemudi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/driver/DriverPanel.jsx
  - transaceh-react/src/driver/Tasks.jsx
  - transaceh-react/src/driver/Trips.jsx
  - transaceh-react/src/driver/Wallet.jsx
  - transaceh-react/src/driver/Profile.jsx
---

# Modul Pengemudi

## Tab

| Tab | Komponen | Fungsi |
| :--- | :--- | :--- |
| `driver` | `Tasks` | Tugas hari ini dan mendatang |
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

- `transaceh-react/src/driver/DriverPanel.jsx:10-23`
- `transaceh-react/src/driver/Tasks.jsx:11-16, 200-250`
- `transaceh-react/src/driver/Wallet.jsx:15-25`
- `transaceh-react/src/lib/domain.js:95-107` — `driverParentIssue`.
- `transaceh-react/src/lib/domain.js:1636-1708` — status trip.

Lihat [[Alur Pengemudi]] dan [[Alur Boarding dan No-show]].
