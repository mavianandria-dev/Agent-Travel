---
title: Pertanyaan Terbuka
type: jurnal
area: jurnal
tags:
  - type/journal
  - area/jurnal
status: aktif
updated: 2026-10-24
source: []
---

# Pertanyaan Terbuka

Gunakan daftar ini untuk investigasi berikutnya. Centang jika sudah terjawab dan pindahkan jawabannya ke catatan topik.

## Data dan konsistensi

- [ ] Apakah `todayStr()` benar-benar menggeser tanggal pada dini hari WIB?
- [ ] Di mana saja `fees` legacy masih dibaca?
- [ ] Apakah ada koleksi yang tumbuh tanpa batas selain yang sudah dibatasi?
- [ ] Bagaimana perilaku `DB.save` jika `localStorage` penuh?
- [ ] Apakah semua koleksi selalu berupa array?

## Booking dan refund

- [ ] Apakah `bookings.fare` selalu ada untuk booking lama?
- [ ] Bagaimana refund jika ledger sudah `dicairkan`?
- [ ] Apakah voucher kembali jika refund sebagian?
- [ ] Apakah booking `pending` yang jadwalnya `missed` otomatis dibatalkan?
- [ ] Bagaimana perlakuan booking `done` yang ingin refund?

## Jadwal dan pengemudi

- [ ] Apakah `syncScheduleLifecycle()` aman jika dua tab berjalan bersamaan?
- [ ] Bagaimana nasib booking `boarded` saat jadwal `missed`?
- [ ] Apakah pengemudi cadangan bisa memulai trip?
- [ ] Apa yang terjadi jika armada dihapus saat masih punya jadwal?
- [ ] Apakah delay melewati tengah malam ditangani dengan benar?

## Maintenance armada

- [x] Apakah pindah armada perlu konfirmasi agen per tiket? **Tidak.** Pelanggan memilih langsung; domain memvalidasi agensi, arah rute, tanggal, harga, kapasitas, dan armada berbeda. Lihat [[Alur Pembatalan dan Refund]].
- [x] Berapa batas waktu memilih? **24 jam sebelum berangkat, minimal 2 jam setelah approval, maksimal 30 menit sebelum berangkat.**
- [x] Apakah jadwal maintenance dianggap `missed`? **Tidak.** `syncScheduleLifecycle()` melewatinya; `syncMaintenanceResolutions()` menutup setelah periode.
- [x] Apakah pengemudi bisa menyetujui request sendiri? **Tidak.** Hanya agen pemilik agensi atau superadmin.
- [x] Apakah status armada berubah saat approval? **Tidak.** Armada tetap `aktif`; hanya tanggal yang diblokir.
- [ ] Apakah kandidat pengganti harus `routeId` identik, bukan hanya grup arah? Saat ini grup arah dipakai dan pickup lama disalin.
- [ ] Apakah status `maintenance` legacy masih perlu dipertahankan jangka panjang, atau dimigrasikan ke request?
- [ ] Bagaimana menangani ledger yang sudah `dicairkan` sebelum booking maintenance dipindahkan/direfund?
- [ ] Apakah refund maintenance perlu prioritas antrean terpisah di admin?

## AI dan support

- [ ] Apakah Worker membatasi biaya/token per user?
- [ ] Apakah percakapan AI disimpan?
- [ ] Bagaimana penanganan AI jika NVIDIA mengembalikan error 429?
- [ ] Apakah tiket guest bisa digabung ke akun setelah login?
- [ ] Apakah `redactPII` mencakup NIK?

## Arsitektur

- [ ] Apakah `domain.js` bisa dipecah per domain tanpa mengubah impor?
- [ ] Apakah perlu router untuk deep link?
- [ ] Apakah perlu skema data berversi?
- [ ] Bagaimana strategi test untuk refund dan ledger?

## Cara menjawab

1. Baca kode sumber.
2. Catat hasil di catatan topik.
3. Jika perlu, tambah entri di [[Jurnal Belajar]].
4. Hapus atau centang pertanyaan ini.
