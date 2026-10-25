---
title: Quick Reference
type: referensi
area: referensi
tags:
  - type/reference
  - area/referensi
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/package.json
  - .github/workflows/deploy-pages.yml
  - transaceh-react/src/lib/seed.js
  - google-apps-script/README.md
---

# Quick Reference

## Perintah

| Tujuan | Perintah | Lokasi |
| :--- | :--- | :--- |
| Install dependency | `npm install` | `transaceh-react/` |
| Dev server | `npm run dev` | `transaceh-react/` |
| Build produksi | `npm run build` | `transaceh-react/` |
| Preview build | `npm run preview` | `transaceh-react/` |
| Lint | `npm run lint` | `transaceh-react/` |
| Worker AI lokal | `npm run worker:dev` | `transaceh-react/` |
| Deploy Worker | `npm run worker:deploy` | `transaceh-react/` |
| Set secret Worker | `npm run worker:secret` | `transaceh-react/` |

Dev server default: `http://localhost:5173`. Worker AI: `http://localhost:8787`.

## Akun demo

Lihat tabel lengkap di [[Akun Demo]].

| Peran | Email | Password |
| :--- | :--- | :--- |
| Super Admin | `admin@transaceh.id` | `admin123` |
| Agen | `agen@barakah.com` | `agen123` |
| Pengemudi | `pengemudi@barakah.com` | `pengemudi123` |
| Pelanggan | `user@demo.com` | `user123` |

## Reset data lokal

Buka DevTools → Console:

```js
Object.keys(localStorage).filter(k => k.startsWith('at_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

Data seed akan dibuat ulang saat halaman dimuat. Rute, jadwal, dan booking tetap kosong; siapkan lewat alur agen → admin.

## Database Google Sheets

Backend `code.gs` 1.2.0 dan adapter frontend sudah ada, tetapi Web App ter-deploy masih 1.1.0 dan menolak `sync`. Mode aplikasi tetap `local` sampai deploy, probe CORS, uji end-to-end, dan lifecycle server-side selesai.

1. Buka spreadsheet kosong → **Extensions → Apps Script**.
2. Pasang `google-apps-script/seed.gs`, `code.gs`, dan `appsscript.json`.
3. Isi Script Properties: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD`.
4. Jalankan `seedProduction()`, lalu `validateDatabase()`.
5. Jalankan `setupBackend()`, deploy Web App, lalu probe CORS.
6. Uji lokal: `node google-apps-script/local-tests/mock-harness.mjs` (265 asersi).

Jangan mengaktifkan `VITE_DATA_MODE=sheets` atau memasukkan data pelanggan/KYC nyata sebelum probe CORS dan uji semua peran selesai. Detail di [[Database Google Sheets]].

## File yang paling sering dibuka

| File | Fungsi |
| :--- | :--- |
| `transaceh-react/src/App.jsx` | Router berbasis `view` |
| `transaceh-react/src/store/AppContext.jsx` | State global, `go()`, modal, toast |
| `transaceh-react/src/lib/db.js` | `DB.load/save` ke `localStorage` |
| `transaceh-react/src/lib/domain.js` | Logika bisnis utama |
| `transaceh-react/src/lib/seed.js` | Data awal + migrasi |
| `transaceh-react/src/pages/Search.jsx` | Wizard booking + pembayaran |
| `transaceh-react/src/lib/checkoutDraft.js` | Draft checkout tamu |

## Rumus tarif

`splitFare()` membagi total menjadi:

- `ticket` — bagian pengemudi
- `service` — jasa agen per kursi
- `fee` — fee platform (global, default 8%)

Sumber: `transaceh-react/src/lib/domain.js:1791`.

## Dokumentasi terkait

- AI/Worker: `docs/AI_SETUP.md`
- Deployment: [[Build dan Deploy]]
- Glosarium: [[Glosarium]]
