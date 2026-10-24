---
title: Alur Siklus Jadwal
type: catatan
area: alur
tags:
  - type/note
  - area/alur
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/agen/SchedForm.jsx
  - transaceh-react/src/driver/Tasks.jsx
  - transaceh-react/src/driver/Maintenance.jsx
  - transaceh-react/src/agen/MaintenanceReview.jsx
---

# Alur Siklus Jadwal

## Status

| Field | Nilai | Arti |
| :--- | :--- | :--- |
| `status` | `open` | Masih bisa dijual |
| `status` | `closed` | Tidak bisa dijual; trip berjalan/selesai |
| `status` | `cancelled` | Dibatalkan |
| `tripStatus` | `scheduled` | Belum berangkat |
| `tripStatus` | `ontrip` | Sedang berjalan |
| `tripStatus` | `arrived` | Selesai |
| `tripStatus` | `missed` | Lewat tanpa keberangkatan |
| `tripStatus` | `cancelled` | Dibatalkan |

## Pembuatan

`SchedForm`:

- Pilih armada dulu.
- Armada harus aktif dan terhubung ke rute.
- Rute mengikuti `vehicleIds`/agensi.
- Pengemudi utama diambil dari data armada; cadangan opsional.
- Harga otomatis dari `priceForAgency()`.
- Bisa pilih beberapa tanggal sekaligus.
- Bentrok jadwal dicek dengan durasi + buffer 30 menit.
- Jadwal disimpan `open` + `scheduled`.

## Perjalanan

```mermaid
stateDiagram-v2
  [*] --> scheduled
  scheduled --> ontrip: setScheduleTripStatus('ontrip')
  ontrip --> arrived: setScheduleTripStatus('arrived')
  scheduled --> missed: syncScheduleLifecycle (lewat 3 jam)
  scheduled --> cancelled: cancelScheduleByOperator
  missed --> arrived: admin toleransi
  arrived --> [*]
  cancelled --> [*]
```

### Mulai trip

`setScheduleTripStatus(sid, 'ontrip')`:

- Jadwal `closed`.
- `departedAt`, `departedBy`.
- Booking `pending` dibatalkan otomatis, termasuk yang sudah boarding.
- Booking `paid` menjadi `ontrip`.
- Notifikasi ke pelanggan.

### Selesai trip

`setScheduleTripStatus(sid, 'arrived')`:

- `arrivedAt`.
- `lateCompletion` jika sebelumnya `missed` atau lewat grace.
- Booking `paid` menjadi `done`.
- `releaseLedger(sid)` → ledger `layak`.

## Auto-close

`syncScheduleLifecycle()` berjalan:

- saat aplikasi dimuat,
- setiap 60 detik.

Aturan:

- Jadwal `scheduled` yang lewat **3 jam** (`SCHEDULE_GRACE_HOURS`) atau tanggal sudah lewat → `missed`.
- Jika ada penumpang `boarded`, jadwal diubah `ontrip` agar tidak dianggap terlewat.
- Booking aktif ikut `missed`, **kecuali** booking yang sudah `boarded`: cabang boarding mengubah jadwal dan booking menjadi `ontrip`.
- Jadwal `missed` tanpa booking aktif → `reviewResult = 'empty'` dan ditutup.
- `ontrip`/`arrived`/`missed` → `status = 'closed'`.

## Maintenance armada

`syncScheduleLifecycle()` **melewati** jadwal yang sedang maintenance agar tidak otomatis menjadi `missed`. Status jadwal tetap `open`/`scheduled` dengan flag `maintenanceStatus = 'active'` supaya tetap terlihat di jadwal, tetapi `schedReady()` dan `canPayBooking()` menolaknya.

Penutupan dilakukan `syncMaintenanceResolutions()`:

- request `disetujui` yang `until` sudah lewat → `selesai`;
- jadwal lampau yang masih `scheduled` → `cancelled` + `closed`, `reviewResult = 'maintenance'`;
- trip `ontrip`/`arrived` tidak dihentikan;
- request yang masih berjalan tetap memblokir tanggalnya.

Saat approval, jadwal pada periode saja yang ditandai; tanggal lain tetap normal. Aksi operator/pengemudi yang mengubah jadwal, kursi, boarding, atau penjualan diblokir selama maintenance pada trip yang belum berangkat.

## Delay

`setScheduleDelay(sid, minutes, reason, note)`:

- Maksimal total delay 180 menit.
- `delayUntil`, `delayMinutes`, `delayReason`, `delayHistory`.
- Pelanggan diberi notifikasi.
- Delay tidak mengubah ETA `tripProgress`.

## Sumber

- `transaceh-react/src/lib/domain.js:1308-1386` — konstanta grace/buffer dan helper waktu.
- `transaceh-react/src/lib/domain.js:1536-1621` — `syncScheduleLifecycle`.
- `transaceh-react/src/lib/domain.js:1470-1535` — `syncMaintenanceResolutions`.
- `transaceh-react/src/lib/domain.js:1622-1683` — delay.
- `transaceh-react/src/lib/domain.js:2341-2420` — status trip.
- `transaceh-react/src/agen/SchedForm.jsx:223-248` — pembuatan.
- `transaceh-react/src/driver/Tasks.jsx` — aksi pengemudi.

Lihat [[Alur Boarding dan No-show]] dan [[Data - schedules dan bookings]].
