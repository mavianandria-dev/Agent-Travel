---
title: Glosarium
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-24
source: []
---

# Glosarium

| Istilah | Arti di TransAceh |
| :--- | :--- |
| **Pelanggan** | Pengguna yang mencari dan memesan travel |
| **Agen** | Mitra travel yang mengelola rute, armada, pengemudi, dan jadwal |
| **Pengemudi** | Pengemudi armada yang menjalankan trip |
| **Superadmin** | Admin platform yang mengawasi semua agen dan transaksi |
| **Armada** | Kendaraan yang dipakai untuk jadwal |
| **Rute** | Asal → tujuan, dengan harga dan titik jemput |
| **Jadwal** | Keberangkatan pada tanggal/jam tertentu |
| **Kursi** | Sel layout armada yang bisa dipesan |
| **Booking** | Pesanan satu atau beberapa kursi |
| **Tiket** | Bukti booking, kode `TA-XXXXX` |
| **Hold** | Kursi ditahan 15 menit sebelum dibayar |
| **Boarding** | Penumpang naik ke armada |
| **Manifest** | Daftar penumpang per jadwal |
| **No-show** | Jadwal tidak berangkat / penumpang tidak muncul |
| **Refund** | Pengembalian dana |
| **Ledger** | Catatan pembagian uang per booking |
| **Settlement** | Pencairan ledger ke pengemudi/agen |
| **GMV** | Gross Merchandise Value, total nilai transaksi |
| **Fee platform** | Potongan platform dari pembayaran |
| **Jasa agen** | Biaya layanan agen per kursi |
| **KYC** | Kelengkapan data dan dokumen agen |
| **Suspend** | Penonaktifan sementara agen/rute |
| **Voucher** | Kode diskon |
| **Support ticket** | Laporan atau live chat bantuan |
| **SSE** | Server-Sent Events, streaming jawaban AI |
| **RTO** | Rute/armada yang siap dijual |
| **Grace period** | Toleransi 3 jam sebelum jadwal dianggap terlewat |
| **Maintenance armada** | Periode armada tidak dipakai, diajukan pengemudi dan disetujui agen, maksimal 2 hari |
| **Request maintenance** | Pengajuan periode maintenance dengan status `menunggu`, `disetujui`, `ditolak`, `dibatalkan`, `selesai` |
| **Armada pengganti** | Jadwal lain dengan agensi, arah rute, tanggal, dan harga sama yang dipakai untuk memindahkan booking |
| **Choice pending** | Booking lunas yang menunggu pilihan refund 100% atau pindah armada |
| **Legacy maintenance** | `vehicles.status = 'maintenance'` lama yang memblokir semua tanggal; bukan alur baru |

## Istilah status

| Status | Konteks | Arti |
| :--- | :--- | :--- |
| `pending` | booking | Menunggu bayar |
| `paid` | booking/payment | Sudah dibayar |
| `done` | booking | Perjalanan selesai |
| `cancelled` | booking/jadwal | Dibatalkan |
| `scheduled` | trip | Belum berangkat |
| `ontrip` | trip | Sedang berjalan |
| `arrived` | trip | Sudah tiba |
| `missed` | trip | Terlewat |
| `choice_pending` | maintenance booking | Menunggu pilihan refund/pindah |
| `replaced` | maintenance booking | Sudah pindah armada |
| `refunded` | maintenance booking | Sudah direfund 100% |
| `cancelled_unpaid` | maintenance booking | Booking pending dibatalkan tanpa refund |
| `menunggu` | maintenance request | Menunggu review agen |
| `disetujui` | maintenance request | Periode aktif |
| `selesai` | maintenance request | Periode selesai |
| `ditahan` | ledger | Dana ditahan |
| `layak` | ledger | Siap dicairkan |
| `dicairkan` | ledger | Sudah dicairkan |
| `void` | ledger | Dibatalkan |
| `new` | support | Tiket baru |
| `process` | support | Diproses |
| `waiting` | support | Menunggu pelanggan |
| `resolved` | support | Selesai |

Lihat [[00 Index]].
