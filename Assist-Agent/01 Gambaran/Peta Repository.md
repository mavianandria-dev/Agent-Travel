---
title: Peta Repository
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-26
source:
  - .github/workflows/deploy-pages.yml
  - transaceh-react/package.json
  - google-apps-script/seed.gs
  - google-apps-script/code.gs
  - google-apps-script/README.md
  - google-apps-script/local-tests/mock-harness.mjs
---

# Peta Repository

## Struktur root

```text
Agent Travel/
├─ .github/workflows/       # deploy GitHub Pages
├─ .opencode/               # skill OpenCode
├─ docs/                    # dokumentasi AI
├─ google-apps-script/      # seed database Google Sheets
├─ transaceh-react/         # aplikasi React aktif
├─ Assist-Agent/            # vault memori ini
├─ index.html               # versi legacy single-file
├─ flowchart.html           # flowchart lama
├─ catatan revisi 1.txt     # catatan revisi
└─ react-folder-structure-skill.md
```

## Aplikasi aktif: `transaceh-react/`

```text
transaceh-react/
├─ src/
│  ├─ main.jsx              # entry React
│  ├─ App.jsx               # router view + layout
│  ├─ store/AppContext.jsx  # state global
│  ├─ pages/                # halaman pelanggan + auth + help
│  ├─ agen/                 # panel agen
│  ├─ driver/               # panel pengemudi
│  ├─ admin/                # panel super admin
│  ├─ components/           # Header, Hero, UI, modal, peta
│  └─ lib/                  # data, domain, seed, AI, util
├─ worker/                  # Cloudflare Worker AI
├─ public/
├─ dist/                    # hasil build (tidak di-commit)
├─ vite.config.js
└─ package.json
```

## Backend data: `google-apps-script/`

```text
google-apps-script/
├─ seed.gs                  # seed produksi minimal + validasi
├─ code.gs                  # API Web App mode direct
├─ appsscript.json          # manifest bound script
├─ local-tests/
│  └─ mock-harness.mjs      # 265 asersi mock Apps Script
└─ README.md                # pemasangan, probe CORS, kontrak API
```

Script terikat ke spreadsheet. `code.gs` versi 1.2.0 memakai mode direct (tanpa proxy DB), sudah punya `sync` ter-scope, dan lulus 265 asersi lokal. Adapter frontend juga sudah ada, tetapi deployment Web App masih 1.1.0; mode default tetap `local` sampai gerbang deploy/CORS lulus. Lihat [[Database Google Sheets]].

## File kunci dan ukuran

| File | Baris | Peran |
| :--- | ---: | :--- |
| `src/lib/domain.js` | 2.816 | Logika bisnis utama |
| `src/lib/seed.js` | 816 | Seed + migrasi data |
| `src/pages/Search.jsx` | 515 | Wizard booking + pembayaran + kartu maintenance |
| `src/agen/KycWizard.jsx` | 459 | KYC agen |
| `src/driver/Tasks.jsx` | 574 | Tugas pengemudi |
| `src/driver/Maintenance.jsx` | 172 | Pengajuan/riwayat maintenance pengemudi |
| `src/agen/MaintenanceReview.jsx` | 118 | Review maintenance agen |
| `src/pages/Tickets.jsx` | 90 | Daftar tiket + status maintenance |
| `src/pages/TicketDetail.jsx` | 246 | Detail tiket + refund/pindah |
| `src/admin/Accounts.jsx` | 509 | Manajemen akun |
| `src/pages/help/ChatSection.jsx` | 429 | Chat AI |
| `google-apps-script/seed.gs` | 476 | Seed database Sheets + validasi |
| `google-apps-script/code.gs` | 3.850 | API Web App 1.2.0: bootstrap, `sync`, validasi domain |
| `google-apps-script/local-tests/mock-harness.mjs` | 1.636 | 265 asersi mock `code.gs` |
| `google-apps-script/README.md` | 383 | Pemasangan, probe CORS, kontrak API |
| `index.html` (root) | 2.053 | Versi legacy single-file |

## Entry point

1. `transaceh-react/index.html` memuat `/src/main.jsx`.
2. `main.jsx` merender `BootGate` dalam `StrictMode`; `BootGate` memanggil `boot()`.
3. Mode local: `initDB()`, `syncScheduleLifecycle()`, `syncMaintenanceResolutions()`. Mode Sheets: `loadSnapshot()` sebelum render.
4. Setelah boot selesai, `App.jsx` membungkus `Router` dengan `AppProvider`. Interval lifecycle hanya aktif di mode local.

## Folder besar

- `src/lib/` — hampir semua aturan bisnis dan data.
- `src/pages/` — layar pelanggan dan auth, termasuk panel refund/pindah maintenance.
- `src/agen/`, `src/driver/`, `src/admin/` — panel per peran; maintenance ada di `driver/Maintenance.jsx` dan `agen/MaintenanceReview.jsx`.
- `src/components/` — komponen lintas halaman.

## Sumber

- `.github/workflows/deploy-pages.yml`
- `transaceh-react/package.json`
- `transaceh-react/vite.config.js`
- `google-apps-script/seed.gs`
- `google-apps-script/code.gs`
- `google-apps-script/README.md`
- `google-apps-script/local-tests/mock-harness.mjs`

Lihat [[File Index]] untuk daftar file lebih lengkap.
