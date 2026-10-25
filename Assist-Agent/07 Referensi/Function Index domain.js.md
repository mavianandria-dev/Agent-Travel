---
title: Function Index domain.js
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-26
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
| `simParse`, `simLabel`, `simExpired` | 10-18 | Parsing/validasi SIM |
| `accountStatusKind` | 24 | Normalisasi status akun |
| `accountStatusLabel`, `accountRoleLabel` | 32-34 | Label tampilan |
| `accountBlocked` | 37 | Cek akun diblokir |
| `checkAccountAccess` | 46 | Pesan alasan blokir |
| `currentUser` | 62 | User dari session |
| `setSession` | 77 | Simpan/hapus session |
| `agentAccountForAgency` | 89 | Cari akun agen |
| `driverParentIssue` | 100 | Cek agen induk pengemudi |
| `createManagedAccount` | 144 | Buat akun |
| `updateManagedAccount` | 196 | Ubah akun |
| `resetManagedAccountPassword` | 227 | Reset password |
| `setManagedAccountStatus` | 241 | Aktif/nonaktif |
| `setAgencyStatusWithAccounts` | 294 | Status agen + akun anak |
| `agentDeleteBlockReason` | 318 | Alasan agen tidak boleh dihapus |
| `deleteManagedAgent` | 326 | Hapus agen tanpa riwayat |

## Agen dan KYC

| Fungsi | Baris |
| :--- | ---: |
| `agencyOf` | 340 |
| `formatAlamat` | 343 |
| `agencyProfileFromKyc` | 350 |
| `syncAgencyProfileFromKyc` | 362 |
| `agencyById` | 639 |
| `agencyPending` | 2660 |
| `KYC_MIN_AGE`, `KYC_JENIS`, `KYC_BENTUK`, `KYC_AGAMA`, `KYC_HUBUNGAN`, `KYC_BANKS` | 2649-2654 |
| `normName` | 2657 |
| `kycAge` | 2671 |
| `checkAgenAccess` | 2682 |
| `validateKycStep1` | 2703 |
| `kycDocGroups` | 2751 |
| `kycDocList` | 2784 |
| `kycDocWajib` | 2789 |
| `kycLengkap` | 2794 |
| `kycSummary` | 2799 |

## Rute

| Fungsi | Baris |
| :--- | ---: |
| `routeById` | 372 |
| `routeGroupKey` | 377 |
| `groupRoutes` | 382 |
| `routesInRouteGroup` | 408 |
| `priceForAgency` | 1793 |
| `normalizePoints` | 2557 |
| `isRouteSuspended` | 2564 |
| `routeOfferedTo` | 2565 |
| `routeBookable` | 2566 |
| `suspendAgencyRoute` | 2567 |
| `activateAgencyRoute` | 2577 |
| `saveRouteRequest` | 2588 |
| `decideRouteRequest` | 2601 |

## Armada dan pengemudi

| Fungsi | Baris |
| :--- | ---: |
| `vehicleById` | 416 |
| `vehName` | 418 |
| `fleetAvailable` | 423 |
| `driverById` | 434 |
| `driverForUser` | 438 |
| `sameDriver` | 449 |
| `driverOptionLabel` | 465 |
| `driverBySnapshot` | 472 |
| `driverForVehicle` | 489 |
| `backupDriverForVehicle` | 499 |
| `DRIVER_DIRECT_FIELDS`, `DRIVER_VERIFY_FIELDS`, `DRIVER_FIELD_LABELS`, `driverFieldLabel` | 512-521 |
| `driverProfileStatus` | 524 |
| `ensureDriverForUser` | 531 |
| `submitDriverProfile` | 563 |
| `approveDriverProfile` | 599 |
| `rejectDriverProfile` | 620 |
| `vehLayout` | 677 |
| `vehSeatCount` | 688 |
| `schedSeatCap` | 690 |

## Maintenance armada

| Fungsi | Baris |
| :--- | ---: |
| `MAINTENANCE_MAX_DAYS` | 704 |
| `maintenanceDateLabel` | 711 |
| `maintenancePeriodLabel` | 718 |
| `maintenanceRequestStatusLabel` | 726 |
| `maintenanceRequestById` | 736 |
| `maintenanceRequestsForVehicle` | 740 |
| `maintenanceRequestsForAgency` | 746 |
| `maintenanceRequestsForDriver` | 752 |
| `vehicleMaintenanceOn` | 760 |
| `scheduleMaintenance` | 777 |
| `vehicleMaintenancePeriods` | 786 |
| `vehicleMaintenanceLabel` | 793 |
| `maintenanceAffectedSchedules` | 803 |
| `maintenanceImpact` | 816 |
| `maintenanceRequestImpact` | 835 |
| `createMaintenanceRequest` | 845 |
| `maintenanceDeadlineFor` | 896 |
| `maintenanceDeadlineLabel` | 906 |
| `maintenanceReplacementCandidatesForBooking` | 921 |
| `maintenanceBookingInfo` | 950 |
| `decideMaintenanceRequest` | 1014 |
| `cancelMaintenanceRequest` | 1164 |
| `refundMaintenanceBooking` | 1199 |
| `moveMaintenanceBooking` | 1230 |
| `syncMaintenanceResolutions` | 1482 |

## Jadwal dan kursi

| Fungsi | Baris |
| :--- | ---: |
| `schedById` | 637 |
| `bookingsOf` | 641 |
| `bookedPassengers` | 645 |
| `takenSeats` | 653 |
| `seatsLeft` | 669 |
| `schedReady` | 692 |
| `SCHEDULE_GRACE_HOURS`, `MAX_DEPARTURE_DELAY_MINUTES` | 1320-1321 |
| `scheduleDepartureMs` | 1324 |
| `scheduleEffectiveDepartureMs` | 1330 |
| `departureTiming` | 1338 |
| `scheduleIsPast` | 1348 |
| `scheduleInHistory` | 1354 |
| `scheduleNeedsReview` | 1362 |
| `routeDurationMinutes` | 1375 |
| `durMinutes` | 1394 |
| `SCHEDULE_BUFFER_MINUTES` | 1399 |
| `countedSchedule` | 1403 |
| `scheduleDateStatus` | 1418 |
| `tripProgress` | 1466 |
| `syncScheduleLifecycle` | 1548 |
| `setScheduleDelay` | 1634 |
| `reportTripDelay` | 1696 |
| `scheduleHasTransactions` | 1727 |
| `seatBookedFuture` | 1732 |
| `toggleScheduleSeatBlock` | 2316 |
| `setScheduleTripStatus` | 2362 |
| `resolveScheduleNoShow` | 2442 |

## Tarif, refund, ledger

| Fungsi | Baris |
| :--- | ---: |
| `hm`, `DEFAULT_SERVICE`, `DEFAULT_PLATFORM_FEE` | 1786-1791 |
| `feeFor` (legacy) | 1764 |
| `priceForAgency` | 1793 |
| `servicePerSeat` | 1794 |
| `platformFeeOf` | 1797 |
| `savePlatformFee` | 1802 |
| `splitFare` | 1812 |
| `DEFAULT_REFUND_POLICY` | 1831 |
| `normalizeRefundPolicy` | 1838 |
| `refundPolicyOf` | 1853 |
| `refundRuleFor` | 1862 |
| `refundPolicyText` | 1870 |
| `saveRefundPolicy` | 1881 |
| `createLedger` | 1899 |
| `releaseLedger` | 1909 |
| `voidLedger` | 1915 |
| `ensureHoldExpiry` | 1954 |
| `canPayBooking` | 1960 |
| `canCancelBooking` | 1970 |
| `cancelBooking` | 1983 |
| `startRefundProcessing` | 2035 |
| `markRefundPaid` | 2064 |
| `cancelScheduleByOperator` | 2102 |
| `settleLedger` | 2540 |
| `ledgerByDriver` | 2546 |
| `ledgerEligible` | 2548 |

## Booking, trip, dan notifikasi

| Fungsi | Baris |
| :--- | ---: |
| `cleanupHolds` | 1736 |
| `feeFor` | 1764 |
| `audit` | 1766 |
| `notify` | 1768 |
| `createDriverBooking` | 2212 |
| `confirmDriverBookingPayment` | 2280 |

> [!note] Nomor baris bisa bergeser
> Selalu verifikasi ulang setelah file berubah. Gunakan pencarian nama fungsi, bukan hanya baris. Tabel ini diperbarui 2026-10-26 setelah patch mode Sheets.

Lihat [[Lapisan Domain]].
