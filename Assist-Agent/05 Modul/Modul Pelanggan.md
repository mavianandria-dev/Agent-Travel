---
title: Modul Pelanggan
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/pelanggan
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/pages/Home.jsx
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/pages/Tickets.jsx
  - transaceh-react/src/pages/TicketDetail.jsx
  - transaceh-react/src/pages/History.jsx
  - transaceh-react/src/pages/Profile.jsx
---

# Modul Pelanggan

## Layar

| Layar | Isi |
| :--- | :--- |
| `Home` | Rute populer, ulasan, partner aktif, kode promo, login demo 1 klik |
| `Search` | Wizard booking 5 langkah |
| `Tickets` | Tiket aktif, tombol bayar ulang, batal, detail |
| `TicketDetail` | E-tiket, QR, manifest, pickup, refund, rating |
| `History` | Riwayat perjalanan selesai/dibatalkan |
| `Profile` | Data akun, kontak favorit, logout |
| `Help` | Pusat bantuan |
| `Notif` | Modal notifikasi |

## Booking

- `Home` bisa quick book rute.
- `Search` memegang state `bw` dari context.
- Tamu boleh mengisi wizard; draft disimpan saat klik bayar.
- Setelah login, draft dilanjutkan otomatis.

## Tiket

`Tickets`:

- Menampilkan tiket `pending` dan `paid`.
- `holdExpiry` dihitung mundur.
- Tombol **Bayar** membuka `PaymentModal`.
- Tombol **Batal** memanggil `cancelBooking`.
- Tiket `done` pindah ke riwayat.

`TicketDetail`:

- QR e-tiket.
- Rute, armada, pengemudi, pickup.
- Status trip dan delay.
- Refund info.
- Rating bintang setelah selesai.

## Profil

- Edit nama/telepon.
- Kontak favorit (`favorites`).
- Melihat status akun.
- Logout menghapus `at_session`.

## Batasan

- Pelanggan tidak bisa mengakses panel agen/driver/admin.
- Booking hanya bisa dibatalkan sebelum perjalanan dan sebelum boarding.
- Refund pelanggan hanya komponen tiket.
- Ulasan hanya setelah perjalanan selesai.

## Sumber

- `transaceh-react/src/pages/Home.jsx:8-90`
- `transaceh-react/src/pages/Search.jsx`
- `transaceh-react/src/pages/Tickets.jsx:8-85`
- `transaceh-react/src/pages/TicketDetail.jsx:35-90`
- `transaceh-react/src/pages/History.jsx`
- `transaceh-react/src/pages/Profile.jsx`

Lihat [[Alur Booking dan Checkout]] dan [[Modul Pusat Bantuan]].
