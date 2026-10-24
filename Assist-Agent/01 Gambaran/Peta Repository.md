---
title: Peta Repository
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-24
source:
  - .github/workflows/deploy-pages.yml
  - transaceh-react/package.json
---

# Peta Repository

## Struktur root

```text
Agent Travel/
├─ .github/workflows/       # deploy GitHub Pages
├─ .opencode/               # skill OpenCode
├─ docs/                    # dokumentasi AI
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

## File kunci dan ukuran

| File | Baris | Peran |
| :--- | ---: | :--- |
| `src/lib/domain.js` | 2.089 | Logika bisnis utama |
| `src/lib/seed.js` | 816 | Seed + migrasi data |
| `src/pages/Search.jsx` | 496 | Wizard booking + pembayaran |
| `src/agen/KycWizard.jsx` | 459 | KYC agen |
| `src/driver/Tasks.jsx` | 562 | Tugas pengemudi |
| `src/admin/Accounts.jsx` | 509 | Manajemen akun |
| `src/pages/help/ChatSection.jsx` | 429 | Chat AI |
| `index.html` (root) | 2.053 | Versi legacy single-file |

## Entry point

1. `transaceh-react/index.html` memuat `/src/main.jsx`.
2. `main.jsx` merender `<App />` dalam `StrictMode`.
3. `App.jsx` membungkus `Router` dengan `AppProvider`.
4. `AppProvider` menjalankan `initDB()` dan `syncScheduleLifecycle()`.

## Folder besar

- `src/lib/` — hampir semua aturan bisnis dan data.
- `src/pages/` — layar pelanggan dan auth.
- `src/agen/`, `src/driver/`, `src/admin/` — panel per peran.
- `src/components/` — komponen lintas halaman.

## Sumber

- `.github/workflows/deploy-pages.yml`
- `transaceh-react/package.json`
- `transaceh-react/vite.config.js`

Lihat [[File Index]] untuk daftar file lebih lengkap.
