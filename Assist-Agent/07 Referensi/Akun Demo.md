---
title: Akun Demo
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/pages/Home.jsx
---

# Akun Demo

Dibuat oleh `seed.js` saat `at_seeded_v16` belum ada.

## Akun utama

| Peran | Email | Password | Agen |
| :--- | :--- | :--- | :--- |
| Superadmin | `admin@transaceh.id` | `admin123` | — |
| Agen | `agen@barakah.com` | `agen123` | AG1 Barakah Travel |
| Agen | `agen@putrajaya.com` | `agen123` | AG2 Putra Jaya Trans |
| Agen | `agen@lintasutara.com` | `agen123` | AG3 Lintas Utara |
| Agen pending | `agen@cahaya.com` | `agen123` | AG4 Cahaya Perkasa |
| Pelanggan | `user@demo.com` | `user123` | — |

## Pengemudi

Semua password: `pengemudi123`.

| Email | Agen | Status |
| :--- | :--- | :--- |
| `pengemudi@barakah.com` | AG1 | aktif |
| `teuku.rizal@barakah.com` | AG1 | aktif |
| `pak.umar@barakah.com` | AG1 | nonaktif |
| `pengemudibaru@mail.com` | AG1 | aktif |
| `samsul@barakah.com` | AG1 | aktif |
| `pengemudi@putrajaya.com` | AG2 | aktif |
| `dedi@putrajaya.com` | AG2 | aktif |
| `agus@lintasutara.com` | AG3 | aktif |
| `fajar@lintasutara.com` | AG3 | aktif |
| `zulkifli@cahaya.com` | AG4 | aktif |

## Catatan

- Login demo 1 klik tersedia di `Home`.
- Agen AG4 `pending`: bisa login, tetapi diarahkan ke KYC.
- Rute, jadwal, dan booking awalnya kosong.
- Jika akun tidak ada, reset `localStorage` lalu reload.
- Jangan mengandalkan akun demo untuk data permanen.

## Sumber

- `transaceh-react/src/lib/seed.js:74-97`
- `transaceh-react/src/pages/Home.jsx:22-40`

Lihat [[Quick Reference]].
