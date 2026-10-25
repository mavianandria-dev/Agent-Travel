---
title: Build dan Deploy
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-26
source:
  - transaceh-react/vite.config.js
  - transaceh-react/package.json
  - .github/workflows/deploy-pages.yml
  - docs/AI_SETUP.md
  - google-apps-script/code.gs
  - google-apps-script/README.md
---

# Build dan Deploy

## Vite

`transaceh-react/vite.config.js`:

- `base`:
  - development: `/`
  - production: `/Agent-Travel/`
- Alias `@` → `transaceh-react/src`.
- Plugin: React + Tailwind CSS.
- Watch mengabaikan `worker/**` agar Wrangler tidak memicu reload UI.

## Script

| Script | Aksi |
| :--- | :--- |
| `npm run dev` | Vite dev server |
| `npm run build` | Build produksi ke `dist/` |
| `npm run preview` | Preview hasil build |
| `npm run lint` | Oxlint |
| `npm run worker:dev` | Wrangler dev |
| `npm run worker:deploy` | Deploy Worker |
| `npm run worker:secret` | Set `NVIDIA_API_KEY` |

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml`:

1. Checkout.
2. Setup Node LTS.
3. `npm ci` di `transaceh-react/`.
4. `npm run build` dengan `VITE_AI_PROXY_URL` dari repository variable.
5. Upload `transaceh-react/dist`.
6. Deploy ke GitHub Pages.

## AI Worker

`transaceh-react/worker/` adalah proxy **AI NVIDIA**, bukan proxy database. Lihat `docs/AI_SETUP.md` untuk langkah lengkap. Ringkasnya:

1. Salin `worker/.dev.vars.example` → `worker/.dev.vars`.
2. Isi `NVIDIA_API_KEY`.
3. `npm run worker:dev` (port 8787).
4. Deploy: `npx wrangler login`, `npm run worker:secret`, `npm run worker:deploy`.
5. Set `VITE_AI_PROXY_URL` di GitHub Actions variable.

> [!warning] Jangan commit secret
> `.env.local`, `.env.*.local`, `.dev.vars`, dan `.wrangler` di-ignore. `transaceh-react/.env` saat ini tracked untuk default mode, jadi jangan pernah mengisi secret di sana. API key hanya di secret Worker.

## Google Apps Script

`google-apps-script/` tidak ikut build GitHub Pages dan belum masuk workflow deploy. Seed dan `code.gs` dipasang manual sebagai bound script dari spreadsheet.

### Status mode Sheets

- `code.gs` di repo sudah versi **1.2.0** dengan aksi `sync` ter-scope dan **265 asersi mock lokal**.
- Adapter frontend (`sheetsApi.js`, `remote.js`, `db.js`, `boot.js`, `AppContext`) sudah ada.
- Web App yang ter-deploy saat catatan ini dibuat masih **1.1.0** dan menolak `sync` (`UNSUPPORTED_ACTION`).
- `.env` default harus tetap `VITE_DATA_MODE=local` sampai deploy, probe CORS, dan uji end-to-end selesai. Jangan mencampur lokal dan Sheets. `VITE_SHEETS_URL` dikosongkan sampai deployment 1.2.0 terverifikasi.
- Lifecycle (`cleanupHolds`, jadwal lampau, resolusi maintenance) belum berjalan di mode Sheets; perlu trigger Apps Script/server-side sebelum data nyata.

### Deploy database mode direct

1. Tempel `seed.gs`, `code.gs` versi 1.2.0, dan `appsscript.json` ke proyek Apps Script yang terikat ke spreadsheet.
2. Isi Script Properties admin, jalankan `seedProduction()`, lalu `validateDatabase()`.
3. Jalankan `setupBackend()` sekali. Pastikan `REQUIRE_PROXY_KEY=false` untuk mode direct.
4. **Deploy → New deployment → Web app**:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Salin URL `/exec`, bukan `/dev`. Jika memperbarui kode, buat versi deployment baru atau edit deployment agar versi 1.2.0 aktif.
6. Probe CORS dari console browser di origin produksi (`https://<user>.github.io/Agent-Travel/`) dan origin dev Vite:

```js
const URL = 'https://script.google.com/macros/s/XXXX/exec';

fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'health' })
})
  .then(async (r) => console.log(r.status, r.type, await r.text()))
  .catch(console.error);
```

Hasil yang diharapkan: `{"ok":true,"data":{"service":"transaceh-db","version":"1.2.0",...}}`.

7. Uji `login`, `bootstrap`, dan `sync` dari browser sebelum mengubah `VITE_DATA_MODE`. Pastikan juga lifecycle server-side sudah tersedia atau batasannya sudah disetujui.

> [!warning] Gerbang mode Sheets
> Jika respons CORS tidak terbaca, jangan aktifkan mode Sheets. Pilih host proxy serverless lain, set `REQUIRE_PROXY_KEY=true`, dan simpan `API_PROXY_KEY` hanya di proxy tersebut. Jika backend belum siap, biarkan aplikasi di mode `local`.

### Catatan

- Database **tidak** memakai Cloudflare Worker. Worker yang ada hanya untuk AI.
- Mode `local` tetap default sampai seluruh gerbang lulus. Setelah itu ubah `VITE_DATA_MODE=sheets` dan isi `VITE_SHEETS_URL`; jangan mencampur data lokal dan remote.
- `session`, `lang`, `checkout_draft`, dan `guest_support_tickets` tetap di `localStorage`; data aplikasi lain masuk cache Sheets.
- Spreadsheet tetap privat; Web App publik dengan URL sebagai gerbang.
- Jangan menaruh `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, atau `API_PROXY_KEY` di frontend.
- Uji lokal `code.gs`: `node google-apps-script/local-tests/mock-harness.mjs` (265 asersi).

Lihat [[Database Google Sheets]] untuk kontrak API, proyeksi publik, filter per peran, dan risiko produksi.

## Sumber

- `transaceh-react/vite.config.js:8-22`
- `transaceh-react/package.json:6-14`
- `.github/workflows/deploy-pages.yml:17-43`
- `docs/AI_SETUP.md`
- `google-apps-script/code.gs`
- `google-apps-script/README.md`

Lihat [[Pusat Bantuan dan AI]] dan [[Database Google Sheets]].
