---
title: i18n dan Format
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/i18n.js
  - transaceh-react/src/lib/utils.js
  - transaceh-react/src/components/ui.jsx
  - transaceh-react/src/store/AppContext.jsx
---

# i18n dan Format

## i18n

`lib/i18n.js` hanya berisi kamus kecil:

```js
T = {
  id: { book, search, myticket, history, help, ... },
  en: { book, search, myticket, history, help, ... }
}
```

`t(key)` di `AppContext`:

```js
T[lang]?.[key] || T.id[key] || key
```

- `lang` disimpan di `at_lang`.
- Header menyediakan tombol bahasa.
- Sebagian besar teks halaman **hardcoded Indonesia**; i18n belum menyeluruh.
- Menambah bahasa berarti menambah kamus dan mengganti teks hardcoded secara bertahap.

## Format rupiah

```js
fmtRp(170000); // "Rp 170.000"
```

Memakai `toLocaleString('id-ID')`.

## Format tanggal

- `todayStr(0)` → `YYYY-MM-DD`.
- `fmtDate(d, lang)` → tanggal panjang.
- `toLocaleDateString('id-ID', {...})` untuk nama hari/bulan.
- ISO string untuk timestamp.

> [!warning] `todayStr` dan timezone
> `todayStr` mengambil tanggal lokal lalu `toISOString().slice(0,10)`. Di WIB (UTC+7), pukul 00:00–06:59 tanggal UTC masih hari sebelumnya. Ini bisa membuat tanggal jadwal bergeser satu hari pada jam tersebut.

## Format jam

- `fmtClock(v)` → `HH.MM` (locale id-ID).
- Jadwal disimpan `HH:MM`.
- UI menampilkan `WIB` secara hardcoded.

## Angka

- Harga disimpan number, bukan string.
- Input form sering mengembalikan string; konversi dengan `Number()` sebelum disimpan.
- Pembulatan uang memakai `Math.round`.

## Sumber

- `transaceh-react/src/lib/i18n.js:3-6`
- `transaceh-react/src/store/AppContext.jsx:50`
- `transaceh-react/src/lib/utils.js:3-16`
- `transaceh-react/src/components/ui.jsx:40-44`

Lihat [[Pola UI dan Komponen]].
