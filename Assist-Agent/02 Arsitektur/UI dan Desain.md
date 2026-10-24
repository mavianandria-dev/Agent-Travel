---
title: UI dan Desain
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/index.css
  - transaceh-react/src/components/ui.jsx
  - transaceh-react/src/components/Header.jsx
  - transaceh-react/src/components/MapPicker.jsx
---

# UI dan Desain

## Gaya visual

- Tailwind CSS 4 dengan utility class langsung di JSX.
- Palet utama: navy `#0b2447`, sky `#0f7ae5`, hijau untuk sukses, amber untuk hold/warning, merah untuk bahaya.
- Kartu membulat besar (`rounded-3xl`), shadow lembut, animasi `anim`, `card-hover`, `focus-ring`.
- Mobile-first: bottom navigation, tombol `btn-touch` minimal 48 px.
- Ada style cetak: `no-print`, `print-only`, manifest bisa dicetak.

## Kelas CSS kustom

`src/index.css` mendefinisikan antara lain:

| Kelas | Fungsi |
| :--- | :--- |
| `.anim`, `.anim-1..4` | Animasi masuk |
| `.modal-bg` | Latar modal blur |
| `.skel` | Skeleton shimmer |
| `.seat.*` | Status kursi: avail, selected, filled, held, blocked, driver |
| `.car-body`, `.car-windshield` | Bentuk kabin |
| `.badge`, `.b-*` | Badge status |
| `.navbtn` | Tombol navigasi |
| `.focus-ring` | Ring fokus input |
| `.table-wrap`, `.data` | Tabel responsif |
| `.btn-touch` | Target sentuh mobile |
| `.toast-in` | Animasi toast |

## Komponen UI bersama

`src/components/ui.jsx` mengekspor:

- `Icon` — map nama ikon ke `lucide-react`.
- `fmtDate` — format tanggal Indonesia/English.
- `Sec` — judul seksi bernomor.
- `Empty` — state kosong.
- `StatCard` — kartu statistik.
- `BadgeStatus` — badge status booking/trip.
- `PillRadios`, `CheckPills` — pilihan bentuk pil.
- `UpBox`, `DocRow`, `DocPreview` — upload dan pratinjau dokumen.
- `CabinGrid` — layout kursi interaktif.
- `useChart` — wrapper Chart.js.
- `Rp` — format rupiah.

## Komponen layout

- `Header` — logo, jam, bahasa, notifikasi, profil, tab per peran.
- `Hero` — banner beranda.
- `Toasts` — notifikasi ringkas.
- `MapPicker` — peta Leaflet untuk titik jemput.
- `BlockSeatModal`, `CancelTripModal` — modal operasional.

## Sumber

- `transaceh-react/src/index.css:1-86`
- `transaceh-react/src/components/ui.jsx:16-33` — map ikon.
- `transaceh-react/src/components/ui.jsx:40-272` — komponen.
- `transaceh-react/src/components/Header.jsx:35-126`
- `transaceh-react/src/components/MapPicker.jsx`

Lihat [[Pola UI dan Komponen]].
