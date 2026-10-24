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
  - transaceh-react/src/driver/Maintenance.jsx
  - transaceh-react/src/agen/MaintenanceReview.jsx
---

# Peran dan Hak Akses

Empat peran didefinisikan di `users.role`:

| Peran | Landing page | Hak utama | Batasan |
| :--- | :--- | :--- | :--- |
| `pelanggan` | `home` | Cari, booking, bayar, tiket, riwayat, profil, bantuan; refund/pindah saat maintenance | Tidak bisa masuk panel agen/driver/admin |
| `agen` | `agen` | Dashboard, pesanan, jadwal, rute, armada, pengemudi, keuangan, setting; review maintenance | Wajib KYC lengkap; hanya data agensinya |
| `pengemudi` | `driver` | Tugas, trip, manifest, boarding, blokir kursi, dompet, profil; ajukan maintenance | Terikat agen induk; agen nonaktif membuat driver terkunci |
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

## Guard maintenance

| Aksi | Siapa | Aturan |
| :--- | :--- | :--- |
| Ajukan periode maintenance | Pengemudi | `driverForUser()` tanpa fallback; hanya armada utama/cadangan; maksimal 2 hari; alasan minimal 10 karakter |
| Batalkan request | Pengemudi pemohon | Hanya saat `menunggu` |
| Setujui/tolak | Agen pemilik agensi atau superadmin | Pengemudi tidak bisa menyetujui request sendiri |
| Refund 100% | Pelanggan pemilik booking atau agen agensi | Hanya saat `choice_pending` atau hasil resolusi |
| Pindah armada | Pelanggan pemilik booking atau agen agensi | Kandidat harus satu agensi, arah rute, tanggal, harga, kursi cukup, dan bukan armada asal |

Approval **tidak** mengubah `vehicles.status`; status tetap `aktif` dan hanya tanggal periode yang diblokir. Status armada `maintenance` adalah legacy global.

## Catatan penting

> [!warning] Guard di client, bukan server
> Semua pengecekan berjalan di browser. Ini cukup untuk prototipe, tetapi bukan batas keamanan produksi.

## Sumber

- `transaceh-react/src/lib/domain.js:19-107` — status dan akses akun.
- `transaceh-react/src/store/AppContext.jsx:19-30` — `roleHome`, `initialView`.
- `transaceh-react/src/store/AppContext.jsx:58-72` — `go()`.
- `transaceh-react/src/App.jsx:36-80` — guard view.
- `transaceh-react/src/components/Header.jsx:100-111` — tab per peran.
- `transaceh-react/src/lib/domain.js:833-883` — pembuatan request pengemudi.
- `transaceh-react/src/lib/domain.js:1002-1151` — keputusan agen dan validasi agensi.
- `transaceh-react/src/lib/domain.js:1187-1296` — refund/pindah dengan cek pemilik.
- `transaceh-react/src/driver/Maintenance.jsx` — UI pengemudi.
- `transaceh-react/src/agen/MaintenanceReview.jsx` — UI review agen.

Lihat [[Modul Pelanggan]], [[Modul Agen]], [[Modul Pengemudi]], [[Modul Superadmin]].
