---
title: Technical Debt dan Jebakan
type: catatan
area: konvensi
tags:
  - type/note
  - area/konvensi
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/lib/domain.js
  - transaceh-react/src/lib/db.js
  - transaceh-react/src/lib/seed.js
  - transaceh-react/src/store/AppContext.jsx
  - google-apps-script/seed.gs
---

# Technical Debt dan Jebakan

## Prioritas tinggi

### 1. Tidak ada backend

- Semua data di `localStorage`.
- Password plaintext.
- Guard hanya di client.
- Data bisa diubah lewat DevTools.
- Tidak aman untuk produksi.
- Seed Google Sheets belum menghilangkan debt ini: belum terhubung ke aplikasi, password admin masih ditulis plaintext, dan belum ada API/otorisasi. Lihat [[Database Google Sheets]].

### 2. Tidak ada transaksi

- Satu aksi menyentuh beberapa koleksi.
- Jika `DB.save` gagal di tengah, data tidak konsisten.
- Tidak ada rollback.

### 3. Race condition antar tab

- Read-modify-write bisa saling menimpa.
- `storage` event hanya memicu render, bukan merge.
- Aksi kritis sebaiknya lewat satu fungsi domain yang membaca ulang.

### 4. Monolit `domain.js`

- ±2.795 baris, banyak domain.
- Sulit dites dan ditelusuri.
- Perubahan kecil bisa memengaruhi booking, refund, dan ledger.
- Alur maintenance menambah tulisan lintas `maintenanceRequests`, `schedules`, `bookings`, `payments`, `ledger`, dan `vehicles`.

## Prioritas sedang

### 5. Tidak ada router

- Tidak ada deep link.
- Refresh kembali ke halaman awal.
- Back browser tidak berfungsi.
- `view` adalah string bebas; typo jatuh ke `Home`.

### 6. Tidak ada test

- Hanya Oxlint.
- Perubahan refund/ledger sangat berisiko.
- Verifikasi manual memakan waktu.

### 7. Seed dan migrasi bertumpuk

- `at_seeded_v16` + banyak flag migrasi.
- Data lama bisa setengah termigrasi.
- Menghapus satu flag bisa memicu migrasi tak terduga.

### 8. Fee legacy

- `fees` masih ada di seed.
- Fee aktif di `settings.platformFee`.
- Kode baru bisa salah membaca `fees`.

### 9. Status tidak konsisten

- `active` vs `aktif`.
- `suspended` vs `nonaktif`.
- `cancelled` untuk booking dan jadwal.
- `tripStatus` dan `status` sering tertukar di UI.

### 10. i18n setengah jadi

- Hanya label navigasi yang diterjemahkan.
- Teks halaman hardcoded Indonesia.
- Tombol bahasa bisa menyesatkan.

## Jebakan teknis

- `todayStr()` bisa bergeser satu hari pada dini hari WIB.
- `bookings.fare` tidak selalu ada pada data lama; fallback `splitFare()` memakai fee saat ini, sehingga nominal historis bisa berubah.
- `syncScheduleLifecycle()` hanya berjalan saat aplikasi dibuka/interval; jika tab ditutup lama, status baru diperbarui saat dibuka lagi.
- `cleanupHolds()` berjalan 10 detik; hold bisa terlihat aktif beberapa detik setelah lewat.
- `createLedger()` mengabaikan booking non-paid.
- `settleLedger()` tidak mengecek kliring 24 jam; UI hanya menandai `Kliring <24 jam`, tetapi checkbox tetap bisa dipilih.
- `setScheduleTripStatus('ontrip')` membatalkan booking pending termasuk yang sudah boarding; sedangkan `syncScheduleLifecycle()` bisa mengubah booking boarding menjadi `ontrip`.
- `Tasks` memfilter `s.driverId` saja; pengemudi cadangan (`backupDriverId`) tidak melihat jadwal di daftar tugas.
- `vehicleMaintenanceOn()` menggabungkan request tanggal dengan status armada legacy. Status `maintenance` lama memblokir **semua** tanggal; jangan dipakai untuk maintenance baru.
- Status `maintenance` tidak lagi ditawarkan untuk armada baru di `VehForm`; opsi hanya muncul jika data lama memang sudah maintenance.
- `drvOfUser()` (tugas lama) memakai fallback driver pertama agen, sedangkan `driverForUser()` untuk maintenance **tidak**. Jangan menukar keduanya.
- Keputusan maintenance memakai user login untuk cek agen, tetapi guard tetap client-only dan bisa dilewati lewat DevTools.
- Pindah armada maintenance memilih kandidat berdasarkan grup arah rute, bukan selalu `routeId` identik; titik jemput ikut disalin. Jika rute satu grup punya pickup berbeda, perlu validasi tambahan.
- Ledger `dicairkan` tidak bisa di-void; refund harus manual. Pindah armada hanya memindahkan ledger yang belum dicairkan.
- `localStorage` penuh membuat `DB.save` melempar error; sebagian besar pemanggil tidak menangkapnya.
- `DB.load` mengembalikan fallback diam-diam jika JSON rusak; korupsi data tidak terlihat.
- `CabinGrid` memakai layout 28 sel; menambah kursi harus mengubah layout dan kapasitas.
- AI Worker mengimpor `src/lib/aiPrompt.js`; perubahan prompt memengaruhi deploy Worker.
- `index.html` legacy bisa menyesatkan; aplikasi aktif ada di `transaceh-react/`.

## Saran perbaikan

1. Pisahkan `domain.js` per area.
2. Tambah test untuk `splitFare`, refund, dan lifecycle.
3. Tambah skema/versi data dan validasi.
4. Ganti `view` string dengan router bila butuh URL.
5. Migration tool sekali jalan, bukan flag bertumpuk.
6. Gunakan enum/konstanta status.
7. Tambah penanganan quota `localStorage`.
8. Terjemahkan UI secara menyeluruh atau hapus tombol bahasa.

## Sumber

- `transaceh-react/src/lib/domain.js`
- `transaceh-react/src/lib/db.js`
- `transaceh-react/src/lib/seed.js`
- `transaceh-react/src/store/AppContext.jsx`
- `transaceh-react/src/lib/utils.js:12-16`
- `transaceh-react/src/lib/domain.js:689-1297` — maintenance armada.
- `transaceh-react/src/lib/domain.js:1470-1535` — sync maintenance.
- `transaceh-react/src/agen/VehForm.jsx:311-314, 394-395` — status legacy dan pembersihan cache periode.
- `transaceh-react/src/driver/Maintenance.jsx` — pengajuan pengemudi.

Lihat [[Pertanyaan Terbuka]].
