---
title: Build dan Deploy
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/vite.config.js
  - transaceh-react/package.json
  - .github/workflows/deploy-pages.yml
  - docs/AI_SETUP.md
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

Lihat `docs/AI_SETUP.md` untuk langkah lengkap. Ringkasnya:

1. Salin `worker/.dev.vars.example` → `worker/.dev.vars`.
2. Isi `NVIDIA_API_KEY`.
3. `npm run worker:dev` (port 8787).
4. Deploy: `npx wrangler login`, `npm run worker:secret`, `npm run worker:deploy`.
5. Set `VITE_AI_PROXY_URL` di GitHub Actions variable.

> [!warning] Jangan commit secret
> `.env`, `.env.*`, `.dev.vars`, dan `.wrangler` sudah di-ignore. API key hanya di secret Worker.

## Sumber

- `transaceh-react/vite.config.js:8-22`
- `transaceh-react/package.json:6-14`
- `.github/workflows/deploy-pages.yml:17-43`
- `docs/AI_SETUP.md`

Lihat [[Pusat Bantuan dan AI]].
