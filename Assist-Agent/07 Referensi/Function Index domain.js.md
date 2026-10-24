---
title: Function Index domain.js
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/domain.js
---

# Function Index `domain.js`

Cara mencari cepat:

```powershell
Select-String -Path "transaceh-react/src/lib/domain.js" -Pattern "^export function"
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
| `agencyPending` | 1933 |
| `kycAge` | 1944 |
| `checkAgenAccess` | 1955 |
| `validateKycStep1` | 1976 |
| `kycDocGroups` | 2024 |
| `kycDocList` | 2057 |
| `kycDocWajib` | 2062 |
| `kycLengkap` | 2067 |
| `kycSummary` | 2072 |

## Rute

| Fungsi | Baris |
| :--- | ---: |
| `routeById` | 367 |
| `routeGroupKey` | 372 |
| `groupRoutes` | 377 |
| `routesInRouteGroup` | 403 |
| `priceForAgency` | 1080 |
| `normalizePoints` | 1830 |
| `isRouteSuspended` | 1837 |
| `routeOfferedTo` | 1838 |
| `routeBookable` | 1839 |
| `suspendAgencyRoute` | 1840 |
| `activateAgencyRoute` | 1850 |
| `saveRouteRequest` | 1861 |
| `decideRouteRequest` | 1874 |

## Armada dan pengemudi

| Fungsi | Baris |
| :--- | ---: |
| `vehicleById` | 411 |
| `vehName` | 413 |
| `fleetAvailable` | 418 |
| `driverById` | 429 |
| `driverForVehicle` | 476 |
| `backupDriverForVehicle` | 486 |
| `driverProfileStatus` | 511 |
| `ensureDriverForUser` | 518 |
| `submitDriverProfile` | 550 |
| `approveDriverProfile` | 586 |
| `rejectDriverProfile` | 607 |
| `vehLayout` | 657 |
| `vehSeatCount` | 668 |
| `schedSeatCap` | 670 |

## Jadwal dan kursi

| Fungsi | Baris |
| :--- | ---: |
| `schedById` | 624 |
| `bookingsOf` | 628 |
| `bookedPassengers` | 632 |
| `takenSeats` | 640 |
| `seatsLeft` | 649 |
| `schedReady` | 672 |
| `scheduleDepartureMs` | 696 |
| `scheduleEffectiveDepartureMs` | 702 |
| `departureTiming` | 710 |
| `scheduleIsPast` | 720 |
| `scheduleInHistory` | 726 |
| `scheduleNeedsReview` | 734 |
| `routeDurationMinutes` | 747 |
| `durMinutes` | 766 |
| `scheduleDateStatus` | 790 |
| `tripProgress` | 836 |
| `syncScheduleLifecycle` | 851 |
| `setScheduleDelay` | 934 |
| `toggleScheduleSeatBlock` | 1593 |
| `setScheduleTripStatus` | 1636 |
| `resolveScheduleNoShow` | 1715 |

## Tarif, refund, ledger

| Fungsi | Baris |
| :--- | ---: |
| `feeFor` (legacy) | 1063 |
| `priceForAgency` | 1080 |
| `servicePerSeat` | 1081 |
| `platformFeeOf` | 1084 |
| `savePlatformFee` | 1089 |
| `splitFare` | 1099 |
| `normalizeRefundPolicy` | 1125 |
| `refundPolicyOf` | 1140 |
| `refundRuleFor` | 1149 |
| `refundPolicyText` | 1157 |
| `saveRefundPolicy` | 1168 |
| `createLedger` | 1186 |
| `releaseLedger` | 1196 |
| `voidLedger` | 1202 |
| `ensureHoldExpiry` | 1241 |
| `canPayBooking` | 1247 |
| `canCancelBooking` | 1256 |
| `cancelBooking` | 1268 |
| `startRefundProcessing` | 1317 |
| `markRefundPaid` | 1346 |
| `cancelScheduleByOperator` | 1384 |
| `settleLedger` | 1813 |
| `ledgerByDriver` | 1819 |
| `ledgerEligible` | 1821 |

## Booking dan trip

| Fungsi | Baris |
| :--- | ---: |
| `createDriverBooking` | 1491 |
| `confirmDriverBookingPayment` | 1558 |
| `cleanupHolds` | 1035 |
| `audit` | 1065 |
| `notify` | 1067 |

> [!note] Nomor baris bisa bergeser
> Selalu verifikasi ulang setelah file berubah. Gunakan pencarian nama fungsi, bukan hanya baris.

Lihat [[Lapisan Domain]].
