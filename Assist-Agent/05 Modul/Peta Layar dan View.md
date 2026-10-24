---
title: Peta Layar dan View
type: referensi
area: modul
tags:
  - type/reference
  - area/modul
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/App.jsx
  - transaceh-react/src/admin/Admin.jsx
  - transaceh-react/src/agen/Agen.jsx
  - transaceh-react/src/driver/DriverPanel.jsx
---

# Peta Layar dan View

## View publik dan pelanggan

| View | Komponen | File |
| :--- | :--- | :--- |
| `home` | `Home` | `pages/Home.jsx` |
| `search` | `Search` | `pages/Search.jsx` |
| `tickets` | `Tickets` | `pages/Tickets.jsx` |
| `ticket-detail:<id>` | `TicketDetail` | `pages/TicketDetail.jsx` |
| `history` | `History` | `pages/History.jsx` |
| `profile` | `Profile` | `pages/Profile.jsx` |
| `help` | `Help` | `pages/Help.jsx` |
| `login` | `Login` | `pages/Auth.jsx` |
| `register` | `Register` | `pages/Auth.jsx` |
| `register-agen` | `RegisterAgen` | `pages/Auth.jsx` |

## View agen

| View | Komponen | Catatan |
| :--- | :--- | :--- |
| `agen` | `Agen` | Tab internal `agenTab` |
| `agen-book` | `Agen` | Memetakan tab `book` |
| `agen-sched` | `Agen` | Tab `sched` |
| `agen-fleet` | `Agen` | Tab `fleet` |
| `agen-fin` | `Agen` | Tab `fin` |
| `agen-pending` | `KycWizard` | Wajib KYC |
| `agen-drvform` | `DrvForm` | Form pengemudi |
| `agen-vehform` | `VehForm` | Form armada |

## View pengemudi

| View | Komponen |
| :--- | :--- |
| `driver` | `DriverPanel` → `Tasks` |
| `driver-maintenance` | `DriverPanel` → `Maintenance` |
| `driver-trips` | `DriverPanel` → `Trips` |
| `driver-wallet` | `DriverPanel` → `Wallet` |
| `driver-profile` | `DriverPanel` → `Profile` |

## View superadmin

| View | Komponen |
| :--- | :--- |
| `admin` | `Admin` → `Overview` |
| `admin-tx` | `Transactions` |
| `admin-ag` | `Agencies` |
| `admin-akun` | `Accounts` |
| `admin-rute` | `Routes` |
| `admin-settle` | `Settlement` |
| `admin-refund` | `Refunds` |
| `admin-master` | `Master` |
| `admin-support` | `Support` |

## Guard

- `ticket-detail` butuh user; jika tidak, tampil `Login`.
- `tickets`, `history`, `profile` butuh user.
- `agen*` butuh user; agen pending dipaksa `KycWizard`.
- `driver*` butuh user.
- `admin*` butuh `superadmin`; role lain melihat `Home`.
- View pelanggan untuk non-pelanggan dialihkan oleh `go()`.

## Sumber

- `transaceh-react/src/App.jsx:24-80`
- `transaceh-react/src/agen/Agen.jsx:13-28`
- `transaceh-react/src/admin/Admin.jsx:13-27`
- `transaceh-react/src/driver/DriverPanel.jsx:11-26`

Lihat [[Navigasi dan View Router]].
