---
title: 00 Modul MOC
type: moc
area: modul
tags:
  - type/moc
  - area/modul
status: aktif
updated: 2026-10-23
source: []
---

# Modul — MOC

Aplikasi dibagi menjadi empat panel peran dan satu pusat bantuan.

| Modul | Folder | Catatan |
| :--- | :--- | :--- |
| Pelanggan | `src/pages/` | [[Modul Pelanggan]] |
| Agen | `src/agen/` | [[Modul Agen]] |
| Pengemudi | `src/driver/` | [[Modul Pengemudi]] |
| Superadmin | `src/admin/` | [[Modul Superadmin]] |
| Pusat Bantuan | `src/pages/help/` | [[Modul Pusat Bantuan]] |

## Peta layar

- [[Peta Layar dan View]] — semua nilai `view` dan komponennya.
- [[Navigasi dan View Router]] — cara perpindahan halaman.

## Pola umum

- Setiap panel punya tab berbasis `view` atau state (`agenTab`).
- Header dan BottomNav menyesuaikan peran.
- Aksi yang mengubah data selalu memanggil `refresh()`.
- Modal dipakai untuk form dan konfirmasi.
- Tabel besar memakai `table-wrap` + `data`.
- Ekspor CSV memakai `Blob` + `URL.createObjectURL`.

## Mulai dari mana

1. [[Peta Layar dan View]]
2. Modul sesuai peran yang sedang dipelajari
3. [[00 Alur Bisnis MOC]] untuk perilaku di balik layar
