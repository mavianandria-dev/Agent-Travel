---
title: Produk TransAceh
type: catatan
area: produk
tags:
  - type/note
  - area/produk
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/lib/seed.js
---

# Produk TransAceh

TransAceh adalah aplikasi pemesanan **travel antar kota** untuk wilayah Aceh dan Sumatera Utara.
Aplikasi mencakup sisi pelanggan, agen travel, pengemudi, dan super admin dalam satu frontend.

## Masalah yang diselesaikan

- Pelanggan sulit mencari jadwal travel, memilih kursi, dan memesan antar kota.
- Agen travel butuh mengelola rute, armada, pengemudi, jadwal, pesanan, dan keuangan.
- Pengemudi butuh manifest, status perjalanan, dan dompet pendapatan.
- Super admin butuh mengawasi agen, rute, transaksi, refund, dan settlement.

## Fitur utama

| Area | Fitur |
| :--- | :--- |
| Pelanggan | Cari rute, pilih tanggal, pilih armada/kursi, isi penumpang, jemput rumah, voucher, bayar, e-tiket, riwayat, refund, bantuan |
| Agen | Dashboard, pesanan, jadwal, rute, armada, pengemudi, keuangan, setting, KYC |
| Pengemudi | Tugas, mulai/selesaikan trip, manifest, boarding, blokir kursi, delay, jual tiket, dompet, profil |
| Super admin | Overview, transaksi, agen, akun, rute, settlement, refund, master data, support |
| AI | Chatbot Pusat Bantuan via Cloudflare Worker + NVIDIA |

## Model bisnis

Pembayaran pelanggan dibagi menjadi tiga komponen melalui `splitFare()`:

1. **Tiket** — bagian pengemudi.
2. **Jasa agen** — biaya layanan per kursi yang ditentukan per agen.
3. **Fee platform** — persentase atau nominal global yang ditentukan admin.

Lihat [[Alur Ledger dan Settlement]] dan [[Data - payments dan ledger]].

## Batasan penting

> [!warning] Ini prototipe simulasi
> - Mode default masih `localStorage`; adapter Google Sheets sudah ada tetapi belum diaktifkan sampai deploy/CORS/uji per peran/lifecycle server-side lulus.
> - Password data demo bisa plaintext sampai migrasi hash saat login.
> - Pembayaran QRIS/VA/e-wallet hanya simulasi, bukan integrasi nyata.
> - Saat mode Sheets, autentikasi dan guard utama berjalan di Apps Script; `commit` superadmin tetap melewati validator domain.
> - AI memakai Worker terpisah; API key tidak ada di frontend.

## Cakupan rute

Data awal menyediakan agen dan armada, tetapi **rute, jadwal, dan booking sengaja kosong**.
Rute dibuat lewat pengajuan agen dan persetujuan admin. Lihat [[Alur Pengajuan Rute]].

## Dokumen terkait

- [[Tech Stack]]
- [[Peran dan Hak Akses]]
- [[Peta Repository]]
- [[Alur Booking dan Checkout]]
