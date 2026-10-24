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

`src/lib/domain.js` adalah inti aturan bisnis. Ukurannya ±2.089 baris dan menangani banyak domain sekaligus.

> [!info] Bukan pure function library
> Sebagian besar fungsi membaca/menulis `localStorage`, memanggil `audit()`, dan mengirim `notify()`. Perlakukan sebagai service layer, bukan util murni.

## Kelompok fungsi

| Kelompok | Fungsi kunci | Baris |
| :--- | :--- | ---: |
| Akun & akses | `accountStatusKind`, `accountBlocked`, `checkAccountAccess`, `currentUser`, `setSession` | 23-72 |
| Manajemen akun | `createManagedAccount`, `updateManagedAccount`, `setAgencyStatusWithAccounts`, `deleteManagedAgent` | 139-333 |
| Agen & KYC | `agencyOf`, `agencyProfileFromKyc`, `agencyPending`, `kycSummary`, `kycDocGroups` | 335-365, 1922-2089 |
| Rute | `routeById`, `groupRoutes`, `routeBookable`, `isRouteSuspended`, `saveRouteRequest`, `decideRouteRequest` | 367-410, 1830-1920 |
| Armada & pengemudi | `vehicleById`, `vehLayout`, `fleetAvailable`, `driverProfileStatus`, `approveDriverProfile` | 411-623 |
| Jadwal | `schedById`, `scheduleDepartureMs`, `syncScheduleLifecycle`, `setScheduleDelay`, `cleanupHolds` | 624-1061 |
| Tarif & fee | `priceForAgency`, `servicePerSeat`, `platformFeeOf`, `splitFare` | 1063-1112 |
| Refund | `refundPolicyOf`, `refundRuleFor`, `cancelBooking`, `startRefundProcessing`, `markRefundPaid` | 1114-1379 |
| Ledger | `createLedger`, `releaseLedger`, `voidLedger`, `settleLedger`, `ledgerEligible` | 1185-1207, 1813-1827 |
| Booking | `canPayBooking`, `canCancelBooking`, `createDriverBooking`, `confirmDriverBookingPayment` | 1239-1590 |
| Operasi trip | `toggleScheduleSeatBlock`, `setScheduleTripStatus`, `resolveScheduleNoShow` | 1593-1811 |

## Fungsi yang paling sering dipakai

- `splitFare(s, nSeats, discount, source)` — membagi total ke tiket/jasa/fee.
- `takenSeats(schedId)` — kursi `paid`, `hold`, `blocked`, `inactive`.
- `seatsLeft(schedId)` — kapasitas dikurangi kursi terpakai.
- `schedReady(s)` — jadwal buka, belum lewat, armada & pengemudi aktif.
- `scheduleIsPast(s, graceHours)` — lewat waktu dengan toleransi.
- `syncScheduleLifecycle()` — otomatis menutup jadwal.
- `refundRuleFor(agencyId, s)` — tier refund berdasarkan jam sebelum berangkat.

## Konvensi penamaan status

- Booking: `pending`, `paid`, `done`, `cancelled`.
- Trip booking: `scheduled`, `ontrip`, `arrived`, `missed`, `cancelled`.
- Jadwal: `status` = `open` / `closed` / `cancelled`; `tripStatus` = status perjalanan.
- Ledger: `ditahan`, `layak`, `dicairkan`, `void`.
- Refund: `none`, `pending`, `diproses`, `done`.

## Sumber

- `transaceh-react/src/lib/domain.js` — lihat [[Function Index domain.js]].
- `transaceh-react/src/lib/domain.js:1099-1112` — `splitFare`.
- `transaceh-react/src/lib/domain.js:1247-1313` — bayar/batal.
- `transaceh-react/src/lib/domain.js:1636-1707` — status trip.

Lihat [[00 Alur Bisnis MOC]].
