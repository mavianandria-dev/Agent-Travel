---
title: Data - vehicles dan drivers
type: catatan
area: data
tags:
  - type/note
  - area/data
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/agen/VehForm.jsx
  - transaceh-react/src/agen/DrvForm.jsx
---

# Data — `vehicles` dan `drivers`

## `vehicles` (armada)

Objek armada cukup besar karena menyatukan identitas, dokumen, pemilik, operasi, dan pengemudi.

| Kelompok | Field utama |
| :--- | :--- |
| Identitas | `id`, `agencyId`, `brand`, `model`, `year`, `color`, `plate`, `chassis`, `engine`, `vtype`, `vtypeOther`, `baggage`, `capacity`, `photo`, `facilities`, `status` |
| Legal | `tax`, `stnkExp`, `kir`, `condition`, `docs`, `docOther`, `stnkPhoto`, `ktpOwnerPhoto` |
| Pemilik | `ownerName`, `ownerBiz`, `ownerNik`, `ownerAddr`, `ownerPhone`, `ownerEmail`, `ownership`, `coopDriverId`, `hasEmail` |
| Operasi | `mainRoute`, `origin`, `dest`, `freq`, `freqOther`, `services`, `opSchedule`, `coopTariff`, `coopSys`, `coopOther`, `fleetCount` |
| Pengemudi | `hasDriver`, `drvName`, `drvPhone`, `drvSim`, `drvSimExp`, `drvExp`, `hasBackup`, `backName`, `backPhone`, `backSim`, `backSimExp` |
| Kursi | `layout`, `inactiveSeats` |

### Status armada

- `aktif` — bisa dipakai jadwal.
- `maintenance` — tidak bisa dipakai.
- Nilai lain diperlakukan tidak tersedia oleh `fleetAvailable`.

### Layout kursi

- `layout` opsional, array 28 sel `{ sid, type }`.
- `vehLayout(v)` memakai `layout` jika ada; jika tidak, membuat layout default:
  - 2 kursi driver (`DRV`, `DRV2`),
  - 6 kursi `A1`–`A6`,
  - 4 area bagasi,
  - sisanya kosong.
- `inactiveSeats` mengubah sel menjadi `off`.
- `vehSeatCount()` menghitung sel bertipe `seat`.
- `capacity` di data seed = 6, sesuai layout default.

> [!warning] Kapasitas vs layout
> `schedSeatCap()` memakai `vehSeatCount()`, bukan `capacity`. Jika layout diubah, kapasitas jadwal ikut berubah.

## `drivers` (pengemudi)

| Field | Keterangan |
| :--- | :--- |
| `id` | `D...` |
| `agencyId` | Agen induk |
| `name`, `phone` | Identitas |
| `simType`, `simExp`, `simNumber`, `simPhoto` | SIM |
| `ktpPhoto`, `selfie`, `photo` | Dokumen/foto |
| `status` | `aktif` / `nonaktif` |
| `rating`, `trips` | Statistik |
| `userEmail` | Penghubung ke `users.email` |
| `birthPlace`, `birthDate`, `gender`, `address`, `nik` | Data pribadi |
| `marital`, `education` | Data tambahan |
| `emName`, `emPhone`, `emRelation` | Kontak darurat |
| `bank` | Info rekening |

### Aturan

- Pengemudi harus terhubung ke agen (`agencyId`).
- `drvOfUser(user)` mencari driver dengan `userEmail`, fallback driver pertama di agen.
- `driverParentIssue(user)` memblokir pengemudi jika agen induk tidak aktif.
- `simExpired()` membandingkan tahun `simExp` dengan tahun sekarang.
- Profil pengemudi bisa memiliki status verifikasi; lihat `driverProfileStatus()` dan `approveDriverProfile()`.
- Satu armada dapat menunjuk pengemudi utama dan cadangan; saat jadwal dibuat, data ini dipakai untuk mengisi `driverId`/`backupDriverId`.

## Relasi

```mermaid
flowchart LR
  A[agencies] --> V[vehicles]
  A --> D[drivers]
  U[users] -->|userEmail| D
  V -->|vehicleId| S[schedules]
  D -->|driverId| S
```

## Sumber

- `transaceh-react/src/lib/seed.js:99-117` — contoh armada dan pengemudi.
- `transaceh-react/src/lib/domain.js:411-623` — helper armada/pengemudi.
- `transaceh-react/src/lib/domain.js:657-670` — layout dan kapasitas.
- `transaceh-react/src/agen/VehForm.jsx` — form armada.
- `transaceh-react/src/agen/DrvForm.jsx` — form pengemudi.

Lihat [[Alur Pengemudi]] dan [[Data - schedules dan bookings]].
