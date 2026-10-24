---
title: Modul Superadmin
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/superadmin
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/admin/Admin.jsx
  - transaceh-react/src/admin/Overview.jsx
  - transaceh-react/src/admin/Transactions.jsx
  - transaceh-react/src/admin/Agencies.jsx
  - transaceh-react/src/admin/Accounts.jsx
  - transaceh-react/src/admin/Routes.jsx
  - transaceh-react/src/admin/Settlement.jsx
  - transaceh-react/src/admin/Refunds.jsx
  - transaceh-react/src/admin/Master.jsx
  - transaceh-react/src/admin/Support.jsx
---

# Modul Superadmin

## Tab

| View | Komponen | Fungsi |
| :--- | :--- | :--- |
| `admin` | `Overview` | GMV, fee, agen, rute teratas, grafik |
| `admin-tx` | `Transactions` | Semua booking, cari kode, export CSV |
| `admin-ag` | `Agencies` | Persetujuan agen, KYC, status |
| `admin-akun` | `Accounts` | Akun semua peran |
| `admin-rute` | `Routes` | Rute per agen, suspend, request |
| `admin-settle` | `Settlement` | Ledger layak, no-show |
| `admin-refund` | `Refunds` | Kebijakan refund per agen |
| `admin-master` | `Master` | Fee platform, jasa agen, banner, audit |
| `admin-support` | `Support` | Tiket bantuan |

## Overview

- GMV dari booking `paid`/`done`.
- Fee platform dari `b.fare.fee` atau `p.fee`.
- Jumlah agen dan rute teratas.
- Grafik transaksi.

## Transaksi

- Semua booking, urut terbaru.
- Cari kode booking.
- Export CSV.
- Fee ditampilkan 0 jika `refundScope = 'total'`.

## Agen dan akun

- Menyetujui/menonaktifkan agen.
- Melihat KYC dan dokumen.
- Membuat akun agen/pengemudi/admin.
- Reset password.
- Nonaktifkan akun.
- Hapus agen hanya jika belum punya riwayat jadwal/ledger.

## Rute

- Daftar rute per agen.
- Suspend/aktifkan rute per agen dengan alasan.
- Menyetujui/menolak `routeRequests`.

## Settlement

- Ledger `layak`.
- Kliring 24 jam.
- Pencairan massal.
- Antrean no-show: pilih persentase refund, proses refund total.
- Antrean refund (`refundStatus` belum `done`) juga memuat refund maintenance 100% dari approval agen.
- Ledger refund maintenance di-void; pindah armada tidak masuk antrean refund.

## Refund

- Kebijakan tiket per agen.
- Tier jam → persen.
- Terapkan ke semua agen.
- Tier 0 jam selalu ada.

## Master

- Fee platform global (`settings.platformFee`).
- Jasa agen per kursi (`agencies.serviceFee`).
- Toggle banner.
- Audit log 20 terakhir.

## Support

- Semua tiket.
- Filter status/channel.
- Balas pesan.
- Ubah status.

## Sumber

- `transaceh-react/src/admin/Admin.jsx:13-27`
- `transaceh-react/src/admin/Overview.jsx:6-45`
- `transaceh-react/src/admin/Transactions.jsx:8-41`
- `transaceh-react/src/admin/Master.jsx:8-82`
- `transaceh-react/src/admin/Refunds.jsx:73-106`
- `transaceh-react/src/admin/Settlement.jsx:84-170`
- `transaceh-react/src/lib/domain.js:1187-1217` — refund maintenance masuk antrean.

Lihat [[Alur Ledger dan Settlement]] dan [[Alur Pembatalan dan Refund]].
