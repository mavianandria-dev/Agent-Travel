---
title: 00 Index
type: moc
area: navigasi
tags:
  - type/moc
  - area/navigasi
status: aktif
updated: 2026-10-26
source: []
---

# TransAceh — Memori Codebase

Vault ini membantu memahami **TransAceh**, aplikasi travel antar kota berbasis React + Vite dengan data default di `localStorage`. Backend Google Sheets sudah melewati tahap seed (tervalidasi); `code.gs` versi 1.3.0 sudah punya `sync` ter-scope, skema penyimpanan kolom (schema 2), dan lulus 286 asersi mock di lokal. Adapter frontend juga sudah ada, tetapi spreadsheet produksi masih format JSON lama (wajib reset + seed ulang) dan mode Sheets belum diaktifkan. Probe CORS dari browser dan lifecycle server-side belum diselesaikan.

> [!info] Mulai dari sini
> Jika baru pertama kali, baca [[Cara Pakai Vault]] lalu ikuti [[Peta Belajar 7 Hari]].

## Peta utama

| MOC | Isi |
| :--- | :--- |
| [[00 Arsitektur MOC]] | Cara aplikasi dijalankan, navigasi, state, data, domain, UI, AI, deploy |
| [[00 Data Model MOC]] | Semua koleksi `localStorage`, relasi, field penting |
| [[00 Alur Bisnis MOC]] | Booking, pembayaran, refund, jadwal, ledger, KYC, pengemudi, support |
| [[00 Modul MOC]] | Peta layar dan modul per peran |

## Orientasi cepat

- [[Produk TransAceh]] — apa yang dibangun dan untuk siapa.
- [[Tech Stack]] — teknologi dan batasannya.
- [[Peta Repository]] — folder dan file penting.
- [[Database Google Sheets]] — seed produksi dan rencana migrasi data.
- [[Peran dan Hak Akses]] — empat peran dan guard akses.
- [[Quick Reference]] — perintah, akun demo, dan reset data.
- [[Legacy index.html vs React]] — hubungan versi lama dan versi aktif.

## Jalur belajar yang disarankan

1. **Pemula** — [[Produk TransAceh]] → [[Tech Stack]] → [[Peta Repository]] → [[Peta Layar dan View]].
2. **Arsitek** — [[Bootstrap dan Provider]] → [[State Management]] → [[Lapisan Data dan Seed]] → [[Lapisan Domain]].
3. **Kontributor** — [[Pola Kode]] → [[Pola Mutasi Data]] → [[Technical Debt dan Jebakan]] → [[FAQ Developer]].

## Referensi dan alat

- [[Glosarium]] — istilah bisnis dan status.
- [[Function Index domain.js]] — daftar fungsi penting dan barisnya.
- [[File Index]] — semua file sumber dan ukurannya.
- [[Akun Demo]] — akun seed untuk semua peran.
- [[FAQ Developer]] — jawaban cepat untuk pertanyaan umum.
- [[Peta Codebase.canvas|Peta Codebase]] — canvas hubungan catatan.
- [[Alur Booking.canvas|Alur Booking]] — canvas alur booking.

## Catatan aktif

- [[2026-10-23 - Sesi 1]] — sesi pembuatan vault dan pemetaan awal.
- [[2026-10-24 - Sesi 2]] — validasi tautan dan koreksi perilaku KYC, boarding, settlement.
- [[2026-10-24 - Sesi 3]] — maintenance armada berbasis tanggal, refund/pindah, dan guard UI.
- [[2026-10-24 - Sesi 4]] — seed produksi minimal Google Sheets dan validasi database.
- [[2026-10-25 - Sesi 5]] — backend API `code.gs`, autentikasi hash, commit revisi, dan harness uji lokal.
- [[Pertanyaan Terbuka]] — hal yang masih perlu diverifikasi.
- [[Jurnal Belajar]] — indeks sesi belajar berikutnya.

## Konvensi vault

- Setiap catatan punya frontmatter: `type`, `area`, `tags`, `status`, `updated`, `source`.
- Hub memakai tag `#type/moc`.
- Catatan teknis memakai tag area, misalnya `#area/arsitektur`, `#area/data`, `#area/alur`.
- Tautan sumber ditulis sebagai path relatif dari root project, contoh `transaceh-react/src/lib/domain.js:1791`.

> [!warning] Dokumen bisa usang
> Kode berubah lebih cepat daripada catatan. Selalu verifikasi ke file sumber, lalu perbarui catatan jika berbeda.
