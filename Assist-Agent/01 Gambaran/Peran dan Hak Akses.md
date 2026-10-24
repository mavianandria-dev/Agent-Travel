---
title: Peran dan Hak Akses
type: catatan
area: produk
tags:
  - type/note
  - area/produk
  - role/pelanggan
  - role/agen
  - role/pengemudi
  - role/superadmin
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/App.jsx
  - transaceh-react/src/components/Header.jsx
---

# Peran dan Hak Akses

Empat peran didefinisikan di `users.role`:

| Peran | Landing page | Hak utama | Batasan |
| :--- | :--- | :--- | :--- |
| `pelanggan` | `home` | Cari, booking, bayar, tiket, riwayat, profil, bantuan | Tidak bisa masuk panel agen/driver/admin |
| `agen` | `agen` | Dashboard, pesanan, jadwal, rute, armada, pengemudi, keuangan, setting | Wajib KYC lengkap; hanya data agensinya |
| `pengemudi` | `driver` | Tugas, trip, manifest, boarding, blokir kursi, dompet, profil | Terikat agen induk; agen nonaktif membuat driver terkunci |
| `superadmin` | `admin` | Semua panel admin, agen, akun, rute, settlement, refund, master, support | Tidak memakai view pelanggan |

## Status akun

`users.status` dan `agencies.status` memakai nilai:

- `active` / `aktif`
- `pending`
- `suspended` / `nonaktif`

Fungsi utama:

- `accountStatusKind()` — normalisasi status lama.
- `accountBlocked()` — akun `suspended` dan `pending` non-agen diblokir; agen pending tetap boleh login untuk KYC.
- `checkAccountAccess()` — pesan alasan blokir.
- `driverParentIssue()` — pengemudi ikut terkunci jika agen induk bermasalah.
- `agencyPending()` — agen belum lengkap KYC.

## Guard navigasi

- `go(view)` di `AppContext` mengalihkan non-pelanggan dari view pelanggan ke `roleHome(role)`.
- `initialView()` memilih halaman awal sesuai user.
- `App.jsx` memeriksa `view.startsWith('agen')`, `driver`, `admin`.
- `admin` hanya untuk `superadmin`; selain itu diarahkan ke `Home`.
- `Header` menyembunyikan tab pelanggan untuk agen/pengemudi/admin.
- `Agen` hanya bisa diakses jika `agencyOf(user)` ada.
- `KycWizard` memaksa agen pending menyelesaikan data.

## Catatan penting

> [!warning] Guard di client, bukan server
> Semua pengecekan berjalan di browser. Ini cukup untuk prototipe, tetapi bukan batas keamanan produksi.

## Sumber

- `transaceh-react/src/lib/domain.js:19-107` — status dan akses akun.
- `transaceh-react/src/store/AppContext.jsx:19-30` — `roleHome`, `initialView`.
- `transaceh-react/src/store/AppContext.jsx:58-72` — `go()`.
- `transaceh-react/src/App.jsx:36-80` — guard view.
- `transaceh-react/src/components/Header.jsx:100-111` — tab per peran.

Lihat [[Modul Pelanggan]], [[Modul Agen]], [[Modul Pengemudi]], [[Modul Superadmin]].
