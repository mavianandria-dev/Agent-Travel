---
title: Legacy index.html vs React
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - index.html
  - transaceh-react/index.html
  - .github/workflows/deploy-pages.yml
---

# Legacy `index.html` vs React

Repo ini punya dua wujud aplikasi:

| Aspek | `index.html` root | `transaceh-react/` |
| :--- | :--- | :--- |
| Bentuk | Single-file HTML + CSS + JS | React + Vite modular |
| Ukuran | ±231 KB, 2.053 baris | 60+ file sumber |
| Status | Legacy / referensi historis | Aplikasi aktif |
| Deploy | Tidak dipakai workflow | Dibangun & di-deploy ke GitHub Pages |
| Data | `localStorage` `at_*` | `localStorage` `at_*` |

## Hubungan data

Keduanya memakai prefix `at_` yang sama. Komentar di `src/lib/db.js` menyebut data dibuat kompatibel dengan `index.html`.
Karena itu, membuka versi legacy di browser yang sama dapat membaca data yang sama.

## Mengapa masih disimpan?

- Referensi perilaku asli sebelum refactor.
- Beberapa komentar di kode React menyebut “diekstrak dari index.html”.
- Berguna untuk membandingkan implementasi lama vs baru.

## Aturan praktis

> [!warning] Jangan mengedit keduanya
> Perbaikan fitur harus dilakukan di `transaceh-react/`. `index.html` hanya referensi; mengeditnya tidak akan mengubah aplikasi yang di-deploy.

## Cara memastikan versi aktif

- Workflow `.github/workflows/deploy-pages.yml` menjalankan `npm ci && npm run build` di `transaceh-react/`.
- Artefak yang di-upload adalah `transaceh-react/dist`.

## Sumber

- `index.html` — versi legacy.
- `transaceh-react/index.html` — entry Vite.
- `.github/workflows/deploy-pages.yml` — build & deploy.

Lihat [[Peta Repository]] dan [[Build dan Deploy]].
