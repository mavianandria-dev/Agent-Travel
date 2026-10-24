---
title: Pertanyaan Terbuka
type: jurnal
area: jurnal
tags:
  - type/journal
  - area/jurnal
status: aktif
updated: 2026-10-23
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
