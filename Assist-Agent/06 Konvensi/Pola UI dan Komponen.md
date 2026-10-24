---
title: Pola UI dan Komponen
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/index.css
  - transaceh-react/src/components/ui.jsx
  - transaceh-react/src/lib/utils.js
---

# Pola UI dan Komponen

## Kelas yang sering dipakai

| Kelas | Fungsi |
| :--- | :--- |
| `anim`, `anim-1..4` | Animasi fade-up |
| `card-hover` | Efek hover kartu |
| `focus-ring` | Ring fokus input |
| `btn-touch` | Target sentuh minimal 48 px |
| `skel` | Skeleton loading |
| `modal-bg` | Latar modal blur |
| `table-wrap`, `data` | Tabel responsif |
| `badge`, `b-*` | Badge status |
| `no-print`, `print-only` | Kontrol cetak |
| `inC` | Class input standar dari `utils.js` |

## Komponen bersama

`src/components/ui.jsx`:

- `Icon` — map nama ke lucide.
- `fmtDate` — tanggal Indonesia/English.
- `Sec` — judul seksi bernomor.
- `Empty` — state kosong.
- `StatCard` — kartu statistik.
- `BadgeStatus` — status booking/trip.
- `PillRadios`, `CheckPills` — pilihan pil.
- `UpBox`, `DocRow`, `DocPreview` — upload/pratinjau.
- `CabinGrid` — layout kursi.
- `useChart` — Chart.js.
- `Rp` — rupiah.

## Layout

- `Header` — logo, jam, bahasa, notifikasi, avatar, tab.
- `Hero` — banner beranda.
- `BottomNav` — navigasi mobile.
- `Toasts` — notifikasi ringkas.
- `MapPicker` — peta Leaflet.
- `BlockSeatModal`, `CancelTripModal` — modal operasional.

## Responsif

- Mobile-first; `sm:`, `md:`, `lg:` untuk layar lebih besar.
- Tabel dibungkus `table-wrap` agar bisa di-scroll horizontal.
- Tombol utama memakai `btn-touch`.
- Modal menjadi bottom sheet di mobile (`items-end`), center di desktop.

## Cetak

- Manifest dan e-tiket memakai `no-print` pada elemen yang tidak perlu.
- `print-only` untuk konten khusus cetak.
- `window.print()` dipanggil dari tombol.

## Aksesibilitas

- Banyak tombol ikon punya `aria-label`.
- `aria-pressed` dipakai pada pilihan rute.
- Fokus input memakai `focus-ring`.
- Beberapa tombol hanya mengandalkan ikon; saat menambah UI, tambahkan label.

## Sumber

- `transaceh-react/src/index.css:1-86`
- `transaceh-react/src/components/ui.jsx:35-272`
- `transaceh-react/src/lib/utils.js:52` — `inC`.

Lihat [[UI dan Desain]] dan [[Pola Navigasi dan Modal]].
