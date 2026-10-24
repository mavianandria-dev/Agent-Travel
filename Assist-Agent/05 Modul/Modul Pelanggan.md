---
title: Modul Pelanggan
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/pelanggan
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/pages/Home.jsx
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/pages/Tickets.jsx
  - transaceh-react/src/pages/TicketDetail.jsx
  - transaceh-react/src/pages/History.jsx
  - transaceh-react/src/pages/Profile.jsx
  - transaceh-react/src/lib/domain.js
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
- Tiket maintenance menampilkan badge `MAINTENANCE`, refund 100%, deadline, dan tombol **Pilih Refund / Pindah**.
- Tiket `replaced` menampilkan asal jadwal dan kursi baru; tiket `refunded`/`cancelled_unpaid` menampilkan hasilnya.

`TicketDetail`:

- QR e-tiket.
- Rute, armada, pengemudi, pickup.
- Status trip dan delay.
- Refund info.
- Panel maintenance: refund 100% atau pilih armada pengganti; QR lama ditandai tidak berlaku.
- Jika pindah, QR tetap berlaku untuk jadwal/kursi baru.
- Rating bintang setelah selesai.

## Profil

- Edit nama/telepon.
- Kontak favorit (`favorites`).
- Melihat status akun.
- Logout menghapus `at_session`.

## Batasan

- Pelanggan tidak bisa mengakses panel agen/driver/admin.
- Booking hanya bisa dibatalkan sebelum perjalanan dan sebelum boarding.
- Refund pelanggan biasa hanya komponen tiket; refund maintenance 100% total.
- Saat `choice_pending`, tombol batal biasa dinonaktifkan; gunakan panel maintenance.
- Ulasan hanya setelah perjalanan selesai.

## Sumber

- `transaceh-react/src/pages/Home.jsx:8-90`
- `transaceh-react/src/pages/Search.jsx`
- `transaceh-react/src/pages/Tickets.jsx:8-89`
- `transaceh-react/src/pages/TicketDetail.jsx:47-52, 119-133, 176-223`
- `transaceh-react/src/lib/domain.js:909-1001` — info maintenance booking.
- `transaceh-react/src/pages/History.jsx`
- `transaceh-react/src/pages/Profile.jsx`

Lihat [[Alur Booking dan Checkout]] dan [[Modul Pusat Bantuan]].
