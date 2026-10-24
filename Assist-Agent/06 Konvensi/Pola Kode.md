---
title: Pola Kode
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/pages/Search.jsx
  - transaceh-react/src/store/AppContext.jsx
---

# Pola Kode

## Gaya umum

- React function component, bukan class.
- File `.jsx` untuk komponen, `.js` untuk logika/data.
- Import memakai alias `@` → `src/`.
- Nama komponen PascalCase; fungsi domain camelCase.
- Komentar dan label UI berbahasa Indonesia.
- Banyak komponen memakai baris padat; jangan memecah hanya demi gaya.

## Struktur komponen

Pola yang sering muncul:

```jsx
export default function Page() {
  const { user, go, toast, refresh, tick } = useApp();
  void tick; // pancing render ulang
  const data = DB.load('...', []);
  ...
}
```

- Data dibaca langsung dari `DB` saat render.
- Aksi bisnis dipanggil dari `lib/domain.js`.
- Setelah mutasi: `DB.save`, lalu `refresh()`.
- Navigasi: `go('view')`.
- Modal: `openModal(<Component />)`.
- Notifikasi: `toast('pesan', 'err' | 'warn' | 'info')`.

## Import domain

Contoh dari `Search.jsx`:

```js
import { schedById, takenSeats, seatsLeft, splitFare, ... } from '@/lib/domain.js';
```

Aturan praktis:

- Jangan menduplikasi rumus harga/refund di komponen.
- Jika aturan dipakai lebih dari satu layar, pindahkan ke `domain.js`.
- Jika hanya formatting, gunakan `lib/utils.js`.

## ID dan waktu

- `uid('BK')` → `BK-XXXXX`.
- `todayStr(offset)` → `YYYY-MM-DD`.
- Waktu disimpan sebagai ISO string (`new Date().toISOString()`).
- Tanggal jadwal disimpan `YYYY-MM-DD`, jam `HH:MM`.

## Guard peran

- Guard navigasi di `go()` dan `App.jsx`.
- Guard login di `checkAccountAccess()`.
- Guard agen di `checkAgenAccess()`.
- Jangan hanya menyembunyikan tombol; tetap validasi di fungsi domain.

## Anti-pola yang sudah ada

- `void tick;` untuk memaksa render.
- Logika besar di komponen (`Search`, `VehForm`, `KycWizard`).
- `DB.load` berulang di render.
- Status string tersebar, bukan enum terpusat.

> [!tip] Saat menambah fitur
> Ikuti pola yang ada: baca DB → validasi domain → simpan → audit/notify → refresh. Jangan memperkenalkan state library baru tanpa alasan kuat.

## Sumber

- `transaceh-react/src/lib/domain.js`
- `transaceh-react/src/pages/Search.jsx:1-10`
- `transaceh-react/src/store/AppContext.jsx:48-97`
- `transaceh-react/src/lib/utils.js:1-18`

Lihat [[Pola Mutasi Data]] dan [[Technical Debt dan Jebakan]].
