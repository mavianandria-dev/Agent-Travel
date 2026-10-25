---
title: Lapisan Domain
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/src/lib/domain.js
---

# Lapisan Domain

`src/lib/domain.js` adalah inti aturan bisnis. Ukurannya ±2.816 baris dan menangani banyak domain sekaligus.

> [!info] Bukan pure function library
> Sebagian besar fungsi membaca/menulis `localStorage`, memanggil `audit()`, dan mengirim `notify()`. Perlakukan sebagai service layer, bukan util murni.

## Kelompok fungsi

| Kelompok | Fungsi kunci | Baris |
| :--- | :--- | ---: |
| Akun & akses | `accountStatusKind`, `accountBlocked`, `checkAccountAccess`, `currentUser`, `setSession` | 24-99 |
| Manajemen akun | `createManagedAccount`, `updateManagedAccount`, `setAgencyStatusWithAccounts`, `deleteManagedAgent` | 144-338 |
| Agen & KYC | `agencyOf`, `agencyProfileFromKyc`, `agencyPending`, `kycSummary`, `kycDocGroups` | 340-371, 2649-2816 |
| Rute | `routeById`, `groupRoutes`, `routeBookable`, `isRouteSuspended`, `saveRouteRequest`, `decideRouteRequest` | 372-415, 2557-2659 |
| Armada & pengemudi | `vehicleById`, `vehLayout`, `fleetAvailable`, `driverForUser`, `driverProfileStatus`, `approveDriverProfile` | 416-691 |
| **Maintenance** | `maintenanceImpact`, `createMaintenanceRequest`, `decideMaintenanceRequest`, `refundMaintenanceBooking`, `moveMaintenanceBooking`, `syncMaintenanceResolutions` | 704-1477, 1482-1547 |
| Jadwal | `schedById`, `scheduleDepartureMs`, `syncScheduleLifecycle`, `setScheduleDelay`, `cleanupHolds` | 637-703, 1310-1792 |
| Tarif & fee | `priceForAgency`, `servicePerSeat`, `platformFeeOf`, `splitFare` | 1786-1830 |
| Refund | `refundPolicyOf`, `refundRuleFor`, `cancelBooking`, `startRefundProcessing`, `markRefundPaid` | 1831-2101, 2442-2539 |
| Ledger | `createLedger`, `releaseLedger`, `voidLedger`, `settleLedger`, `ledgerEligible` | 1899-1959, 2540-2556 |
| Booking | `canPayBooking`, `canCancelBooking`, `createDriverBooking`, `confirmDriverBookingPayment` | 1954-2211 |
| Operasi trip | `toggleScheduleSeatBlock`, `setScheduleTripStatus`, `resolveScheduleNoShow` | 2316-2539 |

## Fungsi yang paling sering dipakai

- `splitFare(s, nSeats, discount, source)` — membagi total ke tiket/jasa/fee.
- `takenSeats(schedId)` — kursi `paid`, `hold`, `blocked`, `inactive`.
- `seatsLeft(schedId)` — kapasitas dikurangi kursi terpakai.
- `schedReady(s)` — jadwal buka, belum lewat, armada & pengemudi aktif, dan tidak maintenance.
- `scheduleIsPast(s, graceHours)` — lewat waktu dengan toleransi.
- `scheduleMaintenance(s)` — request maintenance aktif atau status armada legacy.
- `syncScheduleLifecycle()` — otomatis menutup jadwal di mode local, tetapi melewati jadwal maintenance.
- `syncMaintenanceResolutions()` — menyelesaikan periode, refund otomatis, dan menutup jadwal lampau di mode local.
- `refundRuleFor(agencyId, s)` — tier refund berdasarkan jam sebelum berangkat.

> [!warning] Mode Sheets
> `cleanupHolds`, `syncScheduleLifecycle`, dan `syncMaintenanceResolutions` belum berjalan di mode Sheets. Ketiganya memutasi data lintas pemilik dan perlu trigger server-side sebelum produksi.

## Konvensi penamaan status

- Booking: `pending`, `paid`, `done`, `cancelled`.
- Trip booking: `scheduled`, `ontrip`, `arrived`, `missed`, `cancelled`.
- Jadwal: `status` = `open` / `closed` / `cancelled`; `tripStatus` = status perjalanan.
- Ledger: `ditahan`, `layak`, `dicairkan`, `void`.
- Refund: `none`, `pending`, `diproses`, `done`.
- Maintenance request: `menunggu`, `disetujui`, `ditolak`, `dibatalkan`, `selesai`.
- Maintenance booking: `choice_pending`, `replaced`, `refunded`, `cancelled_unpaid`.

## Sumber

- `transaceh-react/src/lib/domain.js` — lihat [[Function Index domain.js]].
- `transaceh-react/src/lib/domain.js:1812-1825` — `splitFare`.
- `transaceh-react/src/lib/domain.js:1954-2101` — bayar/batal/refund.
- `transaceh-react/src/lib/domain.js:2316-2539` — status trip dan no-show.
- `transaceh-react/src/lib/domain.js:704-1477` — maintenance armada.
- `transaceh-react/src/lib/domain.js:1482-1547` — sinkronisasi maintenance.

Lihat [[00 Alur Bisnis MOC]].
