---
title: Function Index domain.js
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
---

# Function Index `domain.js`

Cara mencari cepat:

```powershell
Select-String -Path "transaceh-react/src/lib/domain.js" -Pattern "^export (function|const)"
```

## Akun dan akses

| Fungsi | Baris | Fungsi |
| :--- | ---: | :--- |
| `simParse`, `simLabel`, `simExpired` | 9–17 | Parsing/validasi SIM |
| `accountStatusKind` | 23 | Normalisasi status akun |
| `accountStatusLabel`, `accountRoleLabel` | 31–33 | Label tampilan |
| `accountBlocked` | 36 | Cek akun diblokir |
| `checkAccountAccess` | 45 | Pesan alasan blokir |
| `currentUser` | 61 | User dari session |
| `setSession` | 72 | Simpan/hapus session |
| `agentAccountForAgency` | 84 | Cari akun agen |
| `driverParentIssue` | 95 | Cek agen induk pengemudi |
| `createManagedAccount` | 139 | Buat akun |
| `updateManagedAccount` | 191 | Ubah akun |
| `resetManagedAccountPassword` | 222 | Reset password |
| `setManagedAccountStatus` | 236 | Aktif/nonaktif |
| `setAgencyStatusWithAccounts` | 289 | Status agen + akun anak |
| `deleteManagedAgent` | 321 | Hapus agen tanpa riwayat |

## Agen dan KYC

| Fungsi | Baris |
| :--- | ---: |
| `agencyOf` | 335 |
| `formatAlamat` | 338 |
| `agencyProfileFromKyc` | 345 |
| `syncAgencyProfileFromKyc` | 357 |
| `agencyPending` | 2639 |
| `kycAge` | 2650 |
| `checkAgenAccess` | 2661 |
| `validateKycStep1` | 2682 |
| `kycDocGroups` | 2730 |
| `kycDocList` | 2763 |
| `kycDocWajib` | 2768 |
| `kycLengkap` | 2773 |
| `kycSummary` | 2778 |

## Rute

| Fungsi | Baris |
| :--- | ---: |
| `routeById` | 367 |
| `routeGroupKey` | 372 |
| `groupRoutes` | 377 |
| `routesInRouteGroup` | 403 |
| `priceForAgency` | 1772 |
| `normalizePoints` | 2536 |
| `isRouteSuspended` | 2543 |
| `routeOfferedTo` | 2544 |
| `routeBookable` | 2545 |
| `suspendAgencyRoute` | 2546 |
| `activateAgencyRoute` | 2556 |
| `saveRouteRequest` | 2567 |
| `decideRouteRequest` | 2580 |

## Armada dan pengemudi

| Fungsi | Baris |
| :--- | ---: |
| `vehicleById` | 411 |
| `vehName` | 413 |
| `fleetAvailable` | 418 |
| `driverById` | 429 |
| `driverForUser` | 433 |
| `driverBySnapshot` | 467 |
| `driverForVehicle` | 484 |
| `backupDriverForVehicle` | 494 |
| `driverProfileStatus` | 519 |
| `ensureDriverForUser` | 526 |
| `submitDriverProfile` | 558 |
| `approveDriverProfile` | 594 |
| `rejectDriverProfile` | 615 |
| `vehLayout` | 665 |
| `vehSeatCount` | 676 |
| `schedSeatCap` | 678 |

## Maintenance armada

| Fungsi | Baris |
| :--- | ---: |
| `MAINTENANCE_MAX_DAYS` | 692 |
| `maintenanceDateLabel` | 699 |
| `maintenancePeriodLabel` | 706 |
| `maintenanceRequestStatusLabel` | 714 |
| `maintenanceRequestById` | 724 |
| `maintenanceRequestsForVehicle` | 728 |
| `maintenanceRequestsForAgency` | 734 |
| `maintenanceRequestsForDriver` | 740 |
| `vehicleMaintenanceOn` | 748 |
| `scheduleMaintenance` | 765 |
| `vehicleMaintenancePeriods` | 774 |
| `vehicleMaintenanceLabel` | 781 |
| `maintenanceAffectedSchedules` | 791 |
| `maintenanceImpact` | 804 |
| `maintenanceRequestImpact` | 823 |
| `createMaintenanceRequest` | 833 |
| `maintenanceDeadlineFor` | 884 |
| `maintenanceDeadlineLabel` | 894 |
| `maintenanceReplacementCandidatesForBooking` | 909 |
| `maintenanceBookingInfo` | 938 |
| `decideMaintenanceRequest` | 1002 |
| `cancelMaintenanceRequest` | 1152 |
| `refundMaintenanceBooking` | 1187 |
| `moveMaintenanceBooking` | 1218 |
| `syncMaintenanceResolutions` | 1470 |

## Jadwal dan kursi

| Fungsi | Baris |
| :--- | ---: |
| `schedById` | 632 |
| `bookingsOf` | 636 |
| `bookedPassengers` | 640 |
| `takenSeats` | 648 |
| `seatsLeft` | 657 |
| `schedReady` | 680 |
| `scheduleDepartureMs` | 1312 |
| `scheduleEffectiveDepartureMs` | 1318 |
| `departureTiming` | 1326 |
| `scheduleIsPast` | 1336 |
| `scheduleInHistory` | 1342 |
| `scheduleNeedsReview` | 1350 |
| `routeDurationMinutes` | 1363 |
| `durMinutes` | 1382 |
| `scheduleDateStatus` | 1406 |
| `tripProgress` | 1454 |
| `syncScheduleLifecycle` | 1536 |
| `setScheduleDelay` | 1622 |
| `toggleScheduleSeatBlock` | 2295 |
| `setScheduleTripStatus` | 2341 |
| `resolveScheduleNoShow` | 2421 |

## Tarif, refund, ledger

| Fungsi | Baris |
| :--- | ---: |
| `feeFor` (legacy) | 1752 |
| `priceForAgency` | 1772 |
| `servicePerSeat` | 1773 |
| `platformFeeOf` | 1776 |
| `savePlatformFee` | 1781 |
| `splitFare` | 1791 |
| `normalizeRefundPolicy` | 1817 |
| `refundPolicyOf` | 1832 |
| `refundRuleFor` | 1841 |
| `refundPolicyText` | 1849 |
| `saveRefundPolicy` | 1860 |
| `createLedger` | 1878 |
| `releaseLedger` | 1888 |
| `voidLedger` | 1894 |
| `ensureHoldExpiry` | 1933 |
| `canPayBooking` | 1939 |
| `canCancelBooking` | 1949 |
| `cancelBooking` | 1962 |
| `startRefundProcessing` | 2014 |
| `markRefundPaid` | 2043 |
| `cancelScheduleByOperator` | 2081 |
| `settleLedger` | 2519 |
| `ledgerByDriver` | 2525 |
| `ledgerEligible` | 2527 |

## Booking dan trip

| Fungsi | Baris |
| :--- | ---: |
| `createDriverBooking` | 2191 |
| `confirmDriverBookingPayment` | 2259 |
| `cleanupHolds` | 1724 |
| `audit` | 1754 |
| `notify` | 1756 |

> [!note] Nomor baris bisa bergeser
> Selalu verifikasi ulang setelah file berubah. Gunakan pencarian nama fungsi, bukan hanya baris. Tabel ini diperbarui 2026-10-24 setelah penambahan blok maintenance.

Lihat [[Lapisan Domain]].
