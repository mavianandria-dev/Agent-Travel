---
title: Modul Pusat Bantuan
type: catatan
area: modul
tags:
  - type/note
  - area/modul
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/pages/Help.jsx
  - transaceh-react/src/pages/help/FaqSection.jsx
  - transaceh-react/src/pages/help/ReportSection.jsx
  - transaceh-react/src/pages/help/StatusSection.jsx
  - transaceh-react/src/pages/help/ChatSection.jsx
  - transaceh-react/src/pages/help/ContactSection.jsx
  - transaceh-react/src/lib/supportContent.js
---

# Modul Pusat Bantuan

## Tab

`Help.jsx`:

| Tab | Komponen | Fungsi |
| :--- | :--- | :--- |
| `faq` | `FaqSection` | Panduan dan pencarian FAQ |
| `report` | `ReportSection` | Form laporan masalah |
| `status` | `StatusSection` | Lacak tiket dengan kode |
| `chat` | `ChatSection` | Live chat + Asisten AI |
| `contact` | `ContactSection` | Kontak CS |

## Header bantuan

- Status CS online/offline (`isSupportOnline()`).
- Jam layanan dari `SUPPORT_CONTACT`.
- Pencarian global yang langsung pindah ke FAQ.
- Statistik tiket user (`ticketStats(ticketsForEmail())`).

## FAQ

- Kategori dari `FAQ_CATEGORIES`.
- Pencarian teks.
- Saran pertanyaan bot.
- Tombol untuk chat atau lapor.

## Laporan

- Kategori, subjek, kode booking, deskripsi.
- Bisa guest.
- Setelah kirim, kode tiket ditampilkan.
- Bisa langsung lacak status.

## Status

- Cari tiket dengan kode.
- Menampilkan status, riwayat, dan pesan.
- User bisa membalas jika belum `resolved`.

## Live Chat

- Membuat tiket `chat`.
- Chat dengan Asisten AI streaming.
- Jika AI tidak tersedia, fallback FAQ.
- Bisa beralih ke laporan jika perlu CS manusia.

## Kontak

- Informasi CS.
- Jam operasional.
- Tautan ke laporan/chat.

## Sumber

- `transaceh-react/src/pages/Help.jsx:12-91`
- `transaceh-react/src/pages/help/ChatSection.jsx`
- `transaceh-react/src/lib/support.js`
- `transaceh-react/src/lib/supportContent.js`

Lihat [[Alur Support dan Chat AI]] dan [[Pusat Bantuan dan AI]].
