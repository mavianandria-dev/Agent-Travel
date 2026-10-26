---
title: 00 Data Model MOC
type: moc
area: data
tags:
  - type/moc
  - area/data
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/lib/domain.js
  - google-apps-script/seed.gs
  - google-apps-script/code.gs
---

# Data Model — MOC

Semua data aplikasi **saat ini** disimpan di `localStorage` dengan prefix `at_`.
Tidak ada database relasional; relasi antar koleksi memakai **ID atau email** di dalam objek.

> [!info] Google Sheets belum aktif
> Skema penyimpanan **kolom (storage v2)** sudah selesai di `google-apps-script/code.gs:519-845` (`API_MAIN_TABLES`) dan seed di `seed.gs`, dan lulus 286 asersi harness lokal; tetapi aplikasi produksi belum memakainya sampai deploy + probe CORS + reset spreadsheet. Tabel di bawah tetap menggambarkan `localStorage`. Lihat [[Database Google Sheets]].

## Koleksi

| Koleksi | Isi | Catatan |
| :--- | :--- | :--- |
| `users` | Akun semua peran | Login memakai `email` + `pass` |
| `agencies` | Profil agen travel | Termasuk `kyc`, `refundPolicy`, `feeValue` |
| `routes` | Rute antar kota | Bisa dipakai banyak agen lewat `agencyIds` |
| `routeRequests` | Usulan rute/harga/titik jemput | Menunggu keputusan admin |
| `vehicles` | Armada | Layout kursi, dokumen, pengemudi utama |
| `drivers` | Pengemudi | Terhubung ke `users` lewat `userEmail` |
| `schedules` | Jadwal keberangkatan | Kombinasi rute + armada + pengemudi |
| `maintenanceRequests` | Pengajuan maintenance armada | Periode maksimal 2 hari; disetujui agen |
| `bookings` | Pesanan kursi | Bisa dari pelanggan atau pengemudi |
| `payments` | Pembayaran simulasi | Satu payment per booking |
| `ledger` | Pembagian pendapatan | `ditahan → layak → dicairkan` |
| `vouchers` | Kode diskon | Persen atau nominal |
| `reviews` | Ulasan pelanggan | Ditampilkan di detail perjalanan |
| `notifications` | Notifikasi in-app | Maksimal 200 entri |
| `settings` | Pengaturan global | Fee platform aktif |
| `fees` | Data fee lama | Legacy; jangan dipakai untuk fee baru |
| `audit` | Log aksi | Maksimal 300 entri |
| `banners` | Banner beranda | Bisa diaktifkan/nonaktifkan |
| `supportTickets` | Tiket bantuan | Laporan dan live chat |

## Kelompok catatan

- [[ERD dan Relasi]] — diagram dan cardinality.
- [[localStorage Keys]] — semua key `at_*` dan flag migrasi.
- [[Data - users dan agencies]]
- [[Data - routes dan routeRequests]]
- [[Data - vehicles dan drivers]]
- [[Data - schedules dan bookings]]
- [[Data - payments dan ledger]]
- [[Data - vouchers, reviews, banners]]
- [[Data - notifications, audit, settings]]
- [[Data - supportTickets]]
- [[Database Google Sheets]] — skema penyimpanan kolom v2 (belum aktif)

## Aturan penting

1. **Tidak ada foreign key** — referensi bisa dangling jika data dihapus manual.
2. **Email adalah kunci login** — ganti email = akun baru.
3. **ID berprefix** — `U-`, `AG`, `R`, `RQ`, `V`, `D`, `S-`, `MT`, `BK`, `PAY`, `LG`, `ST`, `MSG`.
4. **Array disimpan utuh** — setiap perubahan memuat seluruh array, mengubah, lalu menyimpan.
5. **Data bisa hilang** — user dapat menghapus `localStorage` kapan saja.

> [!warning] Jangan menghapus koleksi secara manual
> Relasi tidak otomatis dibersihkan. Gunakan fitur aplikasi atau reset total agar konsisten.
