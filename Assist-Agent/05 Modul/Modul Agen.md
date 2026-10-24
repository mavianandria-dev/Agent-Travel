---
title: Modul Agen
type: catatan
area: modul
tags:
  - type/note
  - area/modul
  - role/agen
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src/agen/Agen.jsx
  - transaceh-react/src/agen/Dashboard.jsx
  - transaceh-react/src/agen/Bookings.jsx
  - transaceh-react/src/agen/Schedules.jsx
  - transaceh-react/src/agen/Routes.jsx
  - transaceh-react/src/agen/Fleet.jsx
  - transaceh-react/src/agen/MaintenanceReview.jsx
  - transaceh-react/src/agen/Drivers.jsx
  - transaceh-react/src/agen/Finance.jsx
  - transaceh-react/src/agen/Setting.jsx
  - transaceh-react/src/agen/KycWizard.jsx
---

# Modul Agen

## Tab

`Agen.jsx` memakai `agenTab`:

| Tab | Komponen | Fungsi |
| :--- | :--- | :--- |
| `dashboard` | `Dashboard` | Statistik agen |
| `book` | `Bookings` | Pesanan, verifikasi transfer, CSV |
| `sched` | `Schedules` | Jadwal, manifest, tambah jadwal |
| `route` | `Routes` | Rute saya, usulan rute/harga/pickup |
| `fleet` | `Fleet` | Armada + antrean maintenance |
| `driver` | `Drivers` | Pengemudi |
| `fin` | `Finance` | Ledger jasa agen |
| `setting` | `Setting` | Profil dan pengaturan |

## Alur masuk

- Login agen → `checkAgenAccess`.
- Jika `agencyPending()` → `KycWizard`.
- Setelah KYC disetujui admin → dashboard penuh.

## Fitur penting

### Pesanan

- Filter status/tanggal.
- Verifikasi pembayaran transfer manual.
- Export CSV.
- Lihat detail booking.

### Jadwal

- Tambah jadwal multi-tanggal.
- Armada harus aktif dan terhubung rute.
- Pengemudi otomatis dari armada.
- Cetak manifest.
- Delay dan trip dikelola pengemudi.

### Rute

- Melihat rute yang tersedia untuk agen.
- Mengusulkan rute baru, ubah harga, atau titik jemput.
- Melihat alasan suspend dari admin.
- Menghubungkan armada ke rute.

### Armada

- Tambah/edit armada.
- Status `aktif`; `maintenance` hanya legacy dan memblokir semua tanggal.
- Dokumen, layout kursi, pengemudi utama/cadangan.
- Validasi bentrok pengemudi.
- Badge periode maintenance dari request yang disetujui.
- Antrean **Pengajuan Maintenance** dari pengemudi.
- `MaintenanceReview` menampilkan alasan, periode, jadwal terdampak, booking lunas/pending, estimasi refund, dan ketersediaan pengganti.
- Setujui → tandai jadwal + proses booking; tolak → wajib catatan. Hanya agen pemilik agensi (atau superadmin) yang boleh memutuskan.

### Pengemudi

- Tambah/edit pengemudi.
- SIM, KTP, selfie, rekening.
- Status aktif/nonaktif.
- Terhubung ke akun login lewat email.

### Keuangan

- Ringkasan `service` dari ledger.
- Status ditahan/layak/dicairkan.
- Tidak ada pencairan mandiri.

## Guard

- Hanya data dengan `agencyId` agen.
- Agen suspended tidak bisa login.
- Menonaktifkan agen dicegah jika ada jadwal aktif.
- KYC wajib sebelum operasi penuh.

## Sumber

- `transaceh-react/src/agen/Agen.jsx:13-28`
- `transaceh-react/src/agen/Bookings.jsx:84-106`
- `transaceh-react/src/agen/SchedForm.jsx:223-248`
- `transaceh-react/src/lib/domain.js:1933-1961`
- `transaceh-react/src/lib/domain.js:1002-1186` — review dan pembatalan maintenance.
- `transaceh-react/src/agen/Fleet.jsx:55-88` — antrean maintenance.
- `transaceh-react/src/agen/MaintenanceReview.jsx:10-118` — modal review.
- `transaceh-react/src/agen/KycWizard.jsx`

Lihat [[Alur KYC dan Onboarding Agen]] dan [[Alur Pengajuan Rute]].
