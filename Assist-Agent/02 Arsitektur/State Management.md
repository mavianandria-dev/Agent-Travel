---
title: State Management
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/lib/domain.js
---

# State Management

State global memakai React Context di `src/store/AppContext.jsx`.

## State yang disimpan

| State | Tipe | Fungsi |
| :--- | :--- | :--- |
| `view` | string | Halaman aktif |
| `lang` | `'id' \| 'en'` | Bahasa UI, disimpan di `at_lang` |
| `tick` | number | Pemicu render ulang setelah data berubah |
| `toasts` | array | Notifikasi ringkas |
| `modal` | React node | Isi modal aktif |
| `bw` | object | State wizard booking |
| `payMethod` | string | Metode bayar terpilih |
| `agenTab` | string | Tab panel agen |
| `filter` | object | Filter pesanan agen |
| `vehEdit`, `drvEdit` | object/null | Target edit armada/pengemudi |
| `navLoading` | boolean | Skeleton navigasi |

## Pola refresh

```text
komponen baca DB.load()
        ↓
aksi mengubah data
        ↓
DB.save()
        ↓
refresh() → tick + 1
        ↓
komponen render ulang dan baca DB lagi
```

`user` dihitung ulang dengan `useMemo(() => currentUser(), [tick, view])`.

> [!info] Data bukan state React
> Array `users`, `bookings`, dan lainnya tidak disimpan di Context. Sumbernya tetap `localStorage`; `tick` hanya memaksa komponen membaca ulang.

## Konsekuensi

- Komponen yang tidak membaca `tick` bisa menampilkan data lama.
- Beberapa komponen memakai `void tick;` hanya untuk memancing render.
- Perubahan dari tab lain ditangkap event `storage` dan menaikkan `tick`.
- Tidak ada optimistic update terpusat; setiap aksi mengurus `DB.save` sendiri.
- `modal` menyimpan elemen React, bukan nama modal; menutup modal cukup `setModal(null)`.

## State wizard booking (`bw`)

Bentuk awal dari `freshBW()`:

```js
{
  step: 1,
  routeId: 'R1',
  date: todayStr(1),
  scheduleId: null,
  seats: [],
  passengers: [],
  pickup: '',
  pickupAddr: '',
  pickupCoords: '',
  voucher: '',
  discount: 0
}
```

`bw` dipakai lintas langkah di `Search`, bisa disimpan ke `at_checkout_draft` untuk tamu, dan direset setelah pembayaran sukses.

## Sumber

- `transaceh-react/src/store/AppContext.jsx:14` — `freshBW`.
- `transaceh-react/src/store/AppContext.jsx:32-46` — state.
- `transaceh-react/src/store/AppContext.jsx:48-49` — `refresh`, `user`.
- `transaceh-react/src/store/AppContext.jsx:99-118` — timer dan `storage`.
- `transaceh-react/src/store/AppContext.jsx:128-134` — value context.

Lihat [[Pola Mutasi Data]].
