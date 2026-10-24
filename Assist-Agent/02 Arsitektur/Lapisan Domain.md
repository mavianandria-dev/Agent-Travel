---
title: Lapisan Domain
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
---

# Lapisan Domain

`src/lib/domain.js` adalah inti aturan bisnis. Ukurannya ±2.795 baris dan menangani banyak domain sekaligus.

> [!info] Bukan pure function library
> Sebagian besar fungsi membaca/menulis `localStorage`, memanggil `audit()`, dan mengirim `notify()`. Perlakukan sebagai service layer, bukan util murni.

## Kelompok fungsi

| Kelompok | Fungsi kunci | Baris |
| :--- | :--- | ---: |
| Akun & akses | `accountStatusKind`, `accountBlocked`, `checkAccountAccess`, `currentUser`, `setSession` | 23-72 |
| Manajemen akun | `createManagedAccount`, `updateManagedAccount`, `setAgencyStatusWithAccounts`, `deleteManagedAgent` | 139-333 |
| Agen & KYC | `agencyOf`, `agencyProfileFromKyc`, `agencyPending`, `kycSummary`, `kycDocGroups` | 335-365, 2639-2795 |
| Rute | `routeById`, `groupRoutes`, `routeBookable`, `isRouteSuspended`, `saveRouteRequest`, `decideRouteRequest` | 367-410, 2567-2638 |
| Armada & pengemudi | `vehicleById`, `vehLayout`, `fleetAvailable`, `driverForUser`, `driverProfileStatus`, `approveDriverProfile` | 411-630 |
| **Maintenance** | `maintenanceImpact`, `createMaintenanceRequest`, `decideMaintenanceRequest`, `refundMaintenanceBooking`, `moveMaintenanceBooking`, `syncMaintenanceResolutions` | 692-1297, 1470-1535 |
| Jadwal | `schedById`, `scheduleDepartureMs`, `syncScheduleLifecycle`, `setScheduleDelay`, `cleanupHolds` | 632-688, 1308-1771 |
| Tarif & fee | `priceForAgency`, `servicePerSeat`, `platformFeeOf`, `splitFare` | 1772-1831 |
| Refund | `refundPolicyOf`, `refundRuleFor`, `cancelBooking`, `startRefundProcessing`, `markRefundPaid` | 1832-1877, 1962-2189, 2421-2518 |
| Ledger | `createLedger`, `releaseLedger`, `voidLedger`, `settleLedger`, `ledgerEligible` | 1878-1932, 2519-2535 |
| Booking | `canPayBooking`, `canCancelBooking`, `createDriverBooking`, `confirmDriverBookingPayment` | 1933-1961, 2191-2294 |
| Operasi trip | `toggleScheduleSeatBlock`, `setScheduleTripStatus`, `resolveScheduleNoShow` | 2081-2189, 2295-2518 |

## Fungsi yang paling sering dipakai

- `splitFare(s, nSeats, discount, source)` — membagi total ke tiket/jasa/fee.
- `takenSeats(schedId)` — kursi `paid`, `hold`, `blocked`, `inactive`.
- `seatsLeft(schedId)` — kapasitas dikurangi kursi terpakai.
- `schedReady(s)` — jadwal buka, belum lewat, armada & pengemudi aktif, dan tidak maintenance.
- `scheduleIsPast(s, graceHours)` — lewat waktu dengan toleransi.
- `scheduleMaintenance(s)` — request maintenance aktif atau status armada legacy.
- `syncScheduleLifecycle()` — otomatis menutup jadwal, tetapi melewati jadwal maintenance.
- `syncMaintenanceResolutions()` — menyelesaikan periode, refund otomatis, dan menutup jadwal lampau.
- `refundRuleFor(agencyId, s)` — tier refund berdasarkan jam sebelum berangkat.

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
- `transaceh-react/src/lib/domain.js:1791-1830` — `splitFare`.
- `transaceh-react/src/lib/domain.js:1939-2013` — bayar/batal.
- `transaceh-react/src/lib/domain.js:2341-2420` — status trip.
- `transaceh-react/src/lib/domain.js:689-1297` — maintenance armada.
- `transaceh-react/src/lib/domain.js:1470-1535` — sinkronisasi maintenance.

Lihat [[00 Alur Bisnis MOC]].
