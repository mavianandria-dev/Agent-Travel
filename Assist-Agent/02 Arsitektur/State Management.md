---
title: State Management
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/lib/boot.js
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

## Sinkronisasi lifecycle dan maintenance

Di mode `local`, `boot.js` menjalankan:

1. `initDB()` menyiapkan seed/migrasi.
2. `syncScheduleLifecycle()` menutup jadwal lampau (melewati jadwal maintenance).
3. `syncMaintenanceResolutions()` menyelesaikan periode maintenance, refund otomatis, dan menutup jadwal maintenance yang sudah lampau.

`AppContext` juga memasang interval `cleanupHolds()` setiap 10 detik dan lifecycle/maintenance setiap 60 detik. Pelanggan yang sedang di `PaymentModal` memantau booking sendiri setiap detik.

> [!warning] Mode Sheets belum punya lifecycle
> Di mode Sheets, interval lifecycle dimatikan. `cleanupHolds`, penutupan jadwal lampau, dan resolusi maintenance memutasi data lintas pemilik sehingga harus dipindahkan ke trigger Apps Script/server-side. Sampai itu ada, mode Sheets belum setara dengan mode local.

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

- `transaceh-react/src/lib/boot.js:1-47` — boot local/Sheets.
- `transaceh-react/src/store/AppContext.jsx:8-10` — import lifecycle dan mode.
- `transaceh-react/src/store/AppContext.jsx:14` — `freshBW`.
- `transaceh-react/src/store/AppContext.jsx:21-60` — state global.
- `transaceh-react/src/store/AppContext.jsx:87-105` — logout remote/local.
- `transaceh-react/src/store/AppContext.jsx:107-145` — handler error sync.
- `transaceh-react/src/store/AppContext.jsx:147-169` — interval lifecycle (local) dan `storage`.
- `transaceh-react/src/store/AppContext.jsx:170+` — value context.

Lihat [[Pola Mutasi Data]].
