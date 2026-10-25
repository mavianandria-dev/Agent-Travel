---
title: Build dan Deploy
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-25
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
> `.env`, `.env.*`, `.dev.vars`, dan `.wrangler` sudah di-ignore. API key hanya di secret Worker.

## Google Apps Script

`google-apps-script/` tidak ikut build GitHub Pages dan belum masuk workflow deploy. Seed dan `code.gs` dipasang manual sebagai bound script dari spreadsheet.

### Deploy database mode direct

1. Tempel `seed.gs`, `code.gs`, dan `appsscript.json` ke proyek Apps Script yang terikat ke spreadsheet.
2. Isi Script Properties admin, jalankan `seedProduction()`, lalu `validateDatabase()`.
3. Jalankan `setupBackend()` sekali. Pastikan `REQUIRE_PROXY_KEY=false` untuk mode direct.
4. **Deploy → New deployment → Web app**:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Salin URL `/exec`, bukan `/dev`.
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

Hasil yang diharapkan: `{"ok":true,"data":{"service":"transaceh-db","version":"1.1.0",...}}`.

> [!warning] Gerbang Fase B
> Jika respons CORS tidak terbaca, jangan lanjut ke adapter frontend. Pilih host proxy serverless lain, set `REQUIRE_PROXY_KEY=true`, dan simpan `API_PROXY_KEY` hanya di proxy tersebut.

### Catatan

- Database **tidak** memakai Cloudflare Worker. Worker yang ada hanya untuk AI.
- Aplikasi React masih memakai `localStorage` sampai Fase B–D selesai. Jangan mencampur data lokal dan remote.
- Spreadsheet tetap privat; Web App publik dengan URL sebagai gerbang.
- Jangan menaruh `API_TOKEN_SECRET`, `PASSWORD_PEPPER`, atau `API_PROXY_KEY` di frontend.
- Uji lokal `code.gs`: `node google-apps-script/local-tests/mock-harness.mjs` (155 asersi).

Lihat [[Database Google Sheets]] untuk kontrak API, proyeksi publik, filter per peran, dan risiko produksi.

## Sumber

- `transaceh-react/vite.config.js:8-22`
- `transaceh-react/package.json:6-14`
- `.github/workflows/deploy-pages.yml:17-43`
- `docs/AI_SETUP.md`
- `google-apps-script/code.gs`
- `google-apps-script/README.md`

Lihat [[Pusat Bantuan dan AI]] dan [[Database Google Sheets]].
