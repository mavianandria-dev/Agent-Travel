---
title: Pola Mutasi Data
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/store/AppContext.jsx
---

# Pola Mutasi Data

## Pola dasar

```js
const arr = DB.load('bookings', []);
const b = arr.find((x) => x.id === id);
b.status = 'paid';
DB.save('bookings', arr);
refresh();
```

Selalu:

1. Load seluruh array.
2. Cari objek.
3. Ubah field.
4. Simpan seluruh array.
5. `refresh()` agar UI membaca ulang.

## Menambah data

- Gunakan `unshift` untuk data terbaru di atas.
- Gunakan `push` untuk data yang urutannya tidak penting.
- Batasi array yang tumbuh terus:
  - `notifications` maksimal 200,
  - `audit` maksimal 300,
  - `seatBlockLog` maksimal 30,
  - `delayHistory` maksimal 20.

## Multi-koleksi

Aksi besar sering menyentuh beberapa koleksi:

- Booking paid → `bookings`, `payments`, `ledger`.
- Refund → `bookings`, `payments`, `ledger`, `vouchers`.
- Cancel schedule → `schedules`, `bookings`, `payments`, `ledger`, `notifications`.
- Route request → `routeRequests`, `routes`, `notifications`, `audit`.

Tidak ada transaksi. Jika satu `DB.save` gagal, data bisa setengah jadi.

## Audit dan notifikasi

- `audit(action, detail)` dipanggil untuk aksi penting.
- `notify(email, title, msg, ch)` untuk pelanggan/agen/admin.
- Keduanya menulis koleksi sendiri; jangan lupa `refresh()` jika UI menampilkan notifikasi.

## Race condition

- Dua tab bisa menulis array yang sama.
- Event `storage` hanya menaikkan `tick`; tidak menggabungkan perubahan.
- Pola aman: baca ulang tepat sebelum menulis, jangan menyimpan array lama dari state komponen.
- Untuk aksi kritis, lakukan load-modify-save dalam satu fungsi domain.

## Stale data

- Komponen yang tidak memakai `tick` bisa menampilkan data lama.
- `refresh()` tidak otomatis dipanggil setelah `DB.save` di luar domain.
- Jika data tidak berubah di UI, cek `refresh()` dan `tick`.

## Sumber

- `transaceh-react/src/lib/db.js:1-6`
- `transaceh-react/src/lib/domain.js:1063-1071` — audit/notify.
- `transaceh-react/src/lib/domain.js:1186-1207` — ledger.
- `transaceh-react/src/store/AppContext.jsx:48-56` — refresh.
- `transaceh-react/src/store/AppContext.jsx:107-118` — storage event.

Lihat [[Lapisan Data dan Seed]] dan [[Technical Debt dan Jebakan]].
