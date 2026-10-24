---
title: Pola Navigasi dan Modal
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/store/AppContext.jsx
  - transaceh-react/src/App.jsx
  - transaceh-react/src/components/Header.jsx
---

# Pola Navigasi dan Modal

## Navigasi

```js
const { go } = useApp();
go('tickets');
go('ticket-detail:' + booking.id);
```

Perilaku `go()`:

1. Cek user dan role.
2. Non-pelanggan dari view pelanggan → `roleHome`.
3. Agen pending → `agen-pending`.
4. Tutup modal.
5. Tampilkan skeleton 420 ms.
6. Set `view`, matikan skeleton, scroll ke atas.
7. Token navigasi mencegah race jika `go()` dipanggil beruntun.

## Modal

```js
openModal(<MyModal />);
closeModal();
```

- `modal` menyimpan React node.
- Backdrop klik → tutup.
- Tombol Escape → tutup (effect di provider).
- Body scroll dikunci saat modal terbuka.
- Modal tidak punya URL sendiri.

## Toast

```js
toast('Berhasil', 'ok');
toast('Gagal', 'err');
toast('Perhatian', 'warn');
toast('Info', 'info');
```

- Durasi 3,6 detik.
- Bisa muncul beberapa sekaligus.
- Jangan memakai `alert()`.

## Tab

- **Agen** memakai `agenTab` (state), bukan `view`.
- **Admin** dan **pengemudi** memakai `view`.
- `AGEN_VIEW_TAB` menyinkronkan view lama ke tab agen.
- Tab internal tidak memicu skeleton navigasi.

## Guard

- `go()` mengarahkan, bukan melempar error.
- `App.jsx` tetap memeriksa prefix view.
- `Header` menyembunyikan tab yang tidak relevan.
- `BottomNav` hanya menampilkan tab pelanggan.

## Jebakan

- Refresh browser → `initialView()`, bukan halaman terakhir.
- Tombol back browser tidak kembali ke view sebelumnya.
- `go()` delay 420 ms; jangan mengandalkan view langsung berubah.
- Modal yang dibuka dari modal lain akan menimpa modal sebelumnya.

## Sumber

- `transaceh-react/src/store/AppContext.jsx:58-85`
- `transaceh-react/src/App.jsx:36-98`
- `transaceh-react/src/components/Header.jsx:100-111`

Lihat [[Navigasi dan View Router]] dan [[State Management]].
