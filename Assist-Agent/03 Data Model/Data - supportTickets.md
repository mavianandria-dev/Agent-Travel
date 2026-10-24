---
title: Data - supportTickets
type: catatan
area: data
tags:
  - type/note
  - area/data
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/support.js
  - transaceh-react/src/pages/help/ChatSection.jsx
  - transaceh-react/src/admin/Support.jsx
---

# Data — `supportTickets`

Tiket bantuan disimpan di `at_supportTickets`. Guest memakai `at_supportGuest`.

## Struktur tiket

| Field | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | string | `ST...` |
| `code` | string | `ADU-YYMMDD-XXXX` atau `CHT-YYMMDD-XXXX` |
| `channel` | string | `report` atau `chat` |
| `userId` | string/null | User login |
| `userEmail` | string | Email pelapor |
| `userName` | string | Nama |
| `userPhone` | string | HP |
| `isGuest` | boolean | Tanpa akun |
| `category` | string | Kategori |
| `subject` | string | Subjek |
| `bookingCode` | string | Kode booking terkait |
| `description` | string | Deskripsi awal |
| `status` | string | `new`, `process`, `waiting`, `resolved` |
| `messages` | array | `{ id, from, text, author, at }` |
| `statusHistory` | array | `{ status, at, by, note }` |
| `createdAt`, `updatedAt` | ISO string | Waktu |

## Status

| Status | Label | Alur |
| :--- | :--- | :--- |
| `new` | Baru | Awal |
| `process` | Diproses | Admin mengambil |
| `waiting` | Menunggu Pelanggan | Butuh jawaban user |
| `resolved` | Selesai | Final |

- Laporan: `new → process → waiting → resolved`.
- Live chat: `new → process → resolved`.
- User tidak bisa mengirim pesan baru setelah `resolved`.

## Kode tiket

`makeTicketCode(channel)`:

- `ADU` untuk laporan.
- `CHT` untuk live chat.
- Format: prefix + tanggal + 4 karakter acak.
- Dicek unik terhadap tiket yang ada.

## Fungsi utama

- `loadTickets()`, `saveTickets()`, `sortTickets()`.
- `findTicket(code)`, `ticketsForEmail(email)`.
- `createTicket({ channel, user, guest, category, subject, ... })`.
- `addMessage(code, from, text, author)`.
- `changeStatus(code, status, by, note)`.
- `ticketStats(list)`.

## Guest

Guest dapat membuat tiket tanpa akun. Identitasnya disimpan di `at_supportGuest` agar bisa melanjutkan chat. Setelah login, tiket guest tidak otomatis terhubung ke akun; pencarian dilakukan lewat kode tiket.

## Sumber

- `transaceh-react/src/lib/support.js:6-140` — status, kode, create, message.
- `transaceh-react/src/lib/support.js:141-219` — perubahan status.
- `transaceh-react/src/pages/help/ChatSection.jsx` — UI chat.
- `transaceh-react/src/admin/Support.jsx` — panel admin.

Lihat [[Alur Support dan Chat AI]].
