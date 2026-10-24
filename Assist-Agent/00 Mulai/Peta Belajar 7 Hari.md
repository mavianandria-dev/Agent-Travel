---
title: Peta Belajar 7 Hari
type: panduan
area: navigasi
tags:
  - type/note
  - area/navigasi
status: aktif
updated: 2026-10-24
source: []
---

# Peta Belajar 7 Hari

Rencana belajar bertahap untuk memahami codebase tanpa tenggelam di detail.

## Hari 1 — Orientasi produk

- Baca [[Produk TransAceh]], [[Tech Stack]], [[Peta Repository]].
- Jalankan aplikasi: `cd transaceh-react && npm install && npm run dev`.
- Login dengan akun demo di [[Akun Demo]].
- **Target:** tahu aplikasi ini untuk siapa, masalah apa yang diselesaikan, dan di mana kode utamanya.

## Hari 2 — Arsitektur dan navigasi

- Baca [[Bootstrap dan Provider]], [[Navigasi dan View Router]], [[State Management]].
- Telusuri `transaceh-react/src/main.jsx`, `App.jsx`, `store/AppContext.jsx`.
- Coba pindah antar `view` dan perhatikan skeleton 420 ms.
- **Target:** bisa menjelaskan alur dari `main.jsx` sampai halaman tampil.

## Hari 3 — Data model

- Baca [[00 Data Model MOC]], [[ERD dan Relasi]], [[localStorage Keys]].
- Buka DevTools → Application → Local Storage.
- Cocokkan koleksi `at_*` dengan catatan.
- **Target:** tahu di mana data disimpan dan bagaimana relasinya.

## Hari 4 — Booking dan pembayaran

- Baca [[Alur Booking dan Checkout]], [[Alur Pembayaran dan Hold]].
- Prasyarat: seed tidak punya rute/jadwal. Sebagai agen, ajukan rute; sebagai admin, setujui; lalu buat jadwal.
- Lakukan booking sebagai pelanggan; amati `bookings`, `payments`, `ledger`.
- **Target:** bisa menjelaskan wizard 5 langkah, hold 15 menit, dan pembagian tarif.

## Hari 5 — Jadwal, refund, ledger

- Baca [[Alur Siklus Jadwal]], [[Alur Pembatalan dan Refund]], [[Alur Ledger dan Settlement]].
- Sebagai agen, kelola jadwal yang sudah dibuat; sebagai pengemudi, mulai trip; sebagai admin, cek settlement.
- **Target:** paham `scheduled → ontrip → arrived/missed` dan `ditahan → layak → dicairkan`.

## Hari 6 — Peran dan modul

- Baca [[Peran dan Hak Akses]], [[Modul Pelanggan]], [[Modul Agen]], [[Modul Pengemudi]], [[Modul Superadmin]].
- Login ke tiap peran dan bandingkan menu.
- **Target:** tahu guard akses dan tanggung jawab tiap peran.

## Hari 7 — Support, AI, dan technical debt

- Baca [[Pusat Bantuan dan AI]], [[Alur Support dan Chat AI]], [[Technical Debt dan Jebakan]].
- Jalankan Worker AI jika punya API key (lihat [[Build dan Deploy]]).
- Tulis ringkasan belajar di [[Jurnal Belajar]].
- **Target:** bisa menjelaskan arsitektur AI dan batasan prototipe.

## Setelah 7 hari

- Pilih satu area untuk didalami: booking/refund, KYC, atau AI.
- Buat catatan baru dari template di `09 Template`.
- Ajukan pertanyaan di [[Pertanyaan Terbuka]].
