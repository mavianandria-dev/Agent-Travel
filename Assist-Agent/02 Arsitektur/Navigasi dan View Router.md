---
title: Navigasi dan View Router
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/App.jsx
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/components/Header.jsx
  - transaceh-react/src/agen/Agen.jsx
  - transaceh-react/src/admin/Admin.jsx
  - transaceh-react/src/driver/DriverPanel.jsx
---

# Navigasi dan View Router

Tidak ada React Router. Navigasi adalah **state string** `view` di `AppContext`.

## Peta view utama

| View | Komponen | Peran |
| :--- | :--- | :--- |
| `home` | `Home` + `Hero` | publik/pelanggan |
| `search` | `Search` | publik/pelanggan |
| `tickets` | `Tickets` | pelanggan |
| `ticket-detail:<id>` | `TicketDetail` | pelanggan |
| `history` | `History` | pelanggan |
| `profile` | `Profile` | pelanggan |
| `help` | `Help` | semua |
| `login`, `register`, `register-agen` | `Auth` | publik |
| `agen`, `agen-book`, `agen-sched`, `agen-fleet`, `agen-fin` | `Agen` | agen |
| `agen-pending`, `agen-drvform`, `agen-vehform` | `KycWizard`, `DrvForm`, `VehForm` | agen |
| `driver`, `driver-trips`, `driver-wallet`, `driver-profile` | `DriverPanel` | pengemudi |
| `admin`, `admin-tx`, `admin-ag`, `admin-akun`, `admin-rute`, `admin-settle`, `admin-refund`, `admin-master`, `admin-support` | `Admin` | superadmin |

## Cara pindah halaman

`go(view)` di `AppContext`:

1. Membaca `currentUser()`.
2. Mengalihkan non-pelanggan dari view pelanggan ke `roleHome(role)`.
3. Memaksa agen pending ke `agen-pending`.
4. Menutup modal, menyalakan skeleton `navLoading`.
5. Setelah 420 ms, mengubah `view`, mematikan skeleton, dan scroll ke atas.

## Tab vs view

- **Header** menampilkan `tabsFor(user)`; untuk agen/pengemudi/admin tab disembunyikan.
- **BottomNav** memakai 5 tab pertama untuk mobile.
- **Agen** memakai `agenTab` di context, bukan `view`, untuk tab internal.
- **Admin** memakai `view` untuk tab internal.
- **DriverPanel** memakai `view` untuk tab internal.
- `AGEN_VIEW_TAB` memetakan `agen-book`/`agen-sched`/`agen-fleet`/`agen-fin` ke tab agen.

## Guard

- `App.jsx` memeriksa prefix `agen`, `driver`, `admin`.
- `admin` hanya untuk `superadmin`; selain itu `<Home />`.
- `agen` tanpa user → `<Login />`.
- Agen pending → `KycWizard`.
- `ticket-detail:` mengambil id dari `view.split(':')[1]`.

> [!warning] Tidak ada URL
> Refresh browser kembali ke `initialView()`. Jangan mengandalkan deep link atau tombol back browser.

## Sumber

- `transaceh-react/src/App.jsx:24-80` — mapping view.
- `transaceh-react/src/store/AppContext.jsx:58-72` — `go()`.
- `transaceh-react/src/components/Header.jsx:100-111` — tab per peran.
- `transaceh-react/src/agen/Agen.jsx:13-28` — tab agen.
- `transaceh-react/src/admin/Admin.jsx:13-27` — tab admin.
- `transaceh-react/src/driver/DriverPanel.jsx:10-23` — tab driver.

Lihat [[Peta Layar dan View]].
