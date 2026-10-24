---
title: File Index
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-24
source:
  - transaceh-react/src
---

# File Index

Jumlah baris adalah total baris file saat catatan dibuat (2026-10-24).

## Entry dan store

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/main.jsx` | 10 | Entry React |
| `src/App.jsx` | 106 | Router view, layout, modal |
| `src/store/AppContext.jsx` | 140 | State global, navigasi, timer |

## Halaman pelanggan

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/pages/Home.jsx` | 90 | Beranda |
| `src/pages/Search.jsx` | 515 | Wizard booking + payment |
| `src/pages/Tickets.jsx` | 90 | Tiket aktif |
| `src/pages/TicketDetail.jsx` | 246 | Detail e-tiket |
| `src/pages/History.jsx` | 43 | Riwayat |
| `src/pages/Profile.jsx` | 76 | Profil |
| `src/pages/Notif.jsx` | 40 | Notifikasi |
| `src/pages/Help.jsx` | 91 | Pusat bantuan |
| `src/pages/Auth.jsx` | 234 | Login/daftar/daftar agen |

## Pusat bantuan

| File | Baris |
| :--- | ---: |
| `src/pages/help/FaqSection.jsx` | 113 |
| `src/pages/help/ReportSection.jsx` | 134 |
| `src/pages/help/StatusSection.jsx` | 199 |
| `src/pages/help/ChatSection.jsx` | 429 |
| `src/pages/help/ContactSection.jsx` | 70 |

## Panel agen

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/agen/Agen.jsx` | 41 | Tab panel |
| `src/agen/Dashboard.jsx` | 115 | Statistik |
| `src/agen/Bookings.jsx` | 155 | Pesanan |
| `src/agen/Schedules.jsx` | 86 | Daftar jadwal |
| `src/agen/SchedForm.jsx` | 359 | Form jadwal |
| `src/agen/Routes.jsx` | 213 | Rute dan usulan |
| `src/agen/Fleet.jsx` | 101 | Daftar armada + antrean maintenance |
| `src/agen/MaintenanceReview.jsx` | 118 | Review maintenance |
| `src/agen/VehForm.jsx` | 436 | Form armada |
| `src/agen/Drivers.jsx` | 136 | Daftar pengemudi |
| `src/agen/DrvForm.jsx` | 201 | Form pengemudi |
| `src/agen/Finance.jsx` | 69 | Keuangan |
| `src/agen/Setting.jsx` | 140 | Pengaturan |
| `src/agen/KycWizard.jsx` | 459 | KYC |

## Panel pengemudi

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/driver/DriverPanel.jsx` | 39 | Tab |
| `src/driver/Maintenance.jsx` | 172 | Pengajuan/riwayat maintenance |
| `src/driver/Tasks.jsx` | 574 | Tugas |
| `src/driver/Trips.jsx` | 31 | Riwayat |
| `src/driver/Wallet.jsx` | 59 | Dompet |
| `src/driver/Profile.jsx` | 174 | Profil |

## Panel admin

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/admin/Admin.jsx` | 40 | Tab |
| `src/admin/Overview.jsx` | 45 | Ringkasan |
| `src/admin/Transactions.jsx` | 41 | Transaksi |
| `src/admin/Agencies.jsx` | 244 | Agen |
| `src/admin/Accounts.jsx` | 509 | Akun |
| `src/admin/Routes.jsx` | 170 | Rute |
| `src/admin/Settlement.jsx` | 226 | Settlement |
| `src/admin/Refunds.jsx` | 106 | Refund |
| `src/admin/Master.jsx` | 84 | Master |
| `src/admin/Support.jsx` | 152 | Support |

## Lib

| File | Baris | Isi |
| :--- | ---: | :--- |
| `src/lib/db.js` | 6 | localStorage wrapper |
| `src/lib/domain.js` | 2795 | Logika bisnis |
| `src/lib/seed.js` | 816 | Seed + migrasi |
| `src/lib/utils.js` | 52 | Util dan konstanta |
| `src/lib/geo.js` | 77 | Koordinat dan estimasi |
| `src/lib/pickups.js` | 75 | Titik jemput |
| `src/lib/daerah.js` | 15 | Data wilayah |
| `src/lib/i18n.js` | 6 | Kamus bahasa |
| `src/lib/checkoutDraft.js` | 81 | Draft tamu |
| `src/lib/upload.js` | 73 | Upload dokumen |
| `src/lib/support.js` | 295 | Tiket bantuan |
| `src/lib/supportContent.js` | 238 | FAQ dan kontak |
| `src/lib/aiClient.js` | 127 | Klien AI |
| `src/lib/aiContext.js` | 51 | Konteks AI |
| `src/lib/aiPrompt.js` | 177 | Prompt AI |
| `src/lib/aiPrivacy.js` | 12 | Redaksi PII |

## Komponen

| File | Baris |
| :--- | ---: |
| `src/components/ui.jsx` | 272 |
| `src/components/Header.jsx` | 126 |
| `src/components/Hero.jsx` | 98 |
| `src/components/Toasts.jsx` | 20 |
| `src/components/MapPicker.jsx` | 252 |
| `src/components/BlockSeatModal.jsx` | 80 |
| `src/components/CancelTripModal.jsx` | 55 |
| `src/index.css` | 95 |

## Worker dan konfigurasi

| File | Isi |
| :--- | :--- |
| `transaceh-react/worker/src/index.js` | Proxy AI |
| `transaceh-react/worker/wrangler.toml` | Konfigurasi Worker |
| `transaceh-react/vite.config.js` | Vite |
| `transaceh-react/package.json` | Dependency/script |
| `.github/workflows/deploy-pages.yml` | Deploy Pages |
| `docs/AI_SETUP.md` | Setup AI |

Lihat [[Peta Repository]].
