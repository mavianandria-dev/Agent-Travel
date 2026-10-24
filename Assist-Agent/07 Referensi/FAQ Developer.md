---
title: FAQ Developer
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-24
source: []
---

# FAQ Developer

### Di mana data disimpan?

`localStorage`, prefix `at_`, lewat `DB.load/save`. Lihat [[localStorage Keys]].

### Bagaimana mereset data?

```js
Object.keys(localStorage).filter(k => k.startsWith('at_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

### Kenapa perubahan data tidak muncul?

Komponen mungkin tidak membaca `tick` atau tidak memanggil `refresh()`. Lihat [[Pola Mutasi Data]].

### Kenapa rute tidak muncul di pencarian?

Cek:

- `routes.active` true,
- `routeBookable()` true,
- agen tidak disuspend,
- ada jadwal `open` + `scheduled` dengan kursi tersisa.

### Kenapa jadwal tidak bisa disimpan?

Cek:

- armada aktif,
- armada terhubung rute,
- durasi rute diketahui,
- tidak bentrok dengan jadwal lain,
- pengemudi armada tidak bentrok.

### Kenapa agen tidak bisa membuka dashboard?

`agencyPending()` true. Selesaikan KYC di `agen-pending`. Lihat [[Alur KYC dan Onboarding Agen]].

### Kenapa pengemudi tidak bisa login?

Cek status akun dan status agen induk. `driverParentIssue()` memblokir jika agen nonaktif.

### Di mana rumus pembagian uang?

`splitFare()` di `domain.js:1791`. Lihat [[Alur Ledger dan Settlement]].

### Kenapa refund hanya sebagian?

Refund pelanggan hanya komponen tiket sesuai kebijakan agen. Refund operator/no-show/maintenance memakai total. Lihat [[Alur Pembatalan dan Refund]].

### Bagaimana alur maintenance armada?

Pengemudi mengajukan periode maksimal 2 hari dari tab **Maintenance**. Agen menyetujui di **Armada**. Booking lunas memilih refund 100% atau pindah armada lewat detail tiket; booking pending dibatalkan tanpa refund. Lihat [[Alur Pembatalan dan Refund]] dan [[Peran dan Hak Akses]].

### Di mana API key AI?

Hanya di secret Cloudflare Worker (`NVIDIA_API_KEY`). Jangan pernah menaruhnya di `VITE_*` atau frontend.

### Bagaimana menambah halaman?

1. Buat komponen di folder peran.
2. Tambah cabang `view` di `App.jsx`.
3. Tambah guard jika perlu.
4. Tambah tab/navigasi.
5. Tambah catatan modul dan perbarui [[Peta Layar dan View]].

### Bagaimana menambah koleksi data?

1. Tambah key di `DB`/seed.
2. Buat fungsi domain untuk mutasi.
3. Tambah catatan di `03 Data Model`.
4. Perbarui [[ERD dan Relasi]] dan [[localStorage Keys]].

### Kenapa baris di catatan berbeda?

Kode berubah. Cari nama fungsi dengan `Select-String`, lalu perbarui catatan.

### Apakah ada test?

Belum. Hanya `npm run lint` (Oxlint). Refund/ledger harus diuji manual.

## Lihat juga

- [[Technical Debt dan Jebakan]]
- [[Pertanyaan Terbuka]]
- [[Cara Pakai Vault]]
