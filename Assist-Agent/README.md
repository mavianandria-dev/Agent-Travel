---
title: README Vault Assist-Agent
type: panduan
area: navigasi
tags:
  - type/note
  - area/navigasi
status: aktif
updated: 2026-10-23
source: []
---

# Assist-Agent

Vault Obsidian ini adalah **memori jangka panjang** untuk mempelajari codebase TransAceh.
Isinya bukan salinan kode, melainkan peta, penjelasan alur, model data, konvensi, dan catatan belajar.

## Cara membuka

1. Buka Obsidian.
2. Pilih **Open folder as vault**.
3. Arahkan ke folder `Assist-Agent` di dalam project ini.
4. Mulai dari [[00 Index]].

## Prinsip

- Catatan ditulis dalam bahasa Indonesia.
- Setiap catatan punya frontmatter dan tautan ke sumber kode.
- Satu topik = satu catatan; hub utama memakai MOC (Map of Content).
- Perubahan kode harus disertai pembaruan catatan yang relevan.
- Konfigurasi workspace Obsidian tidak di-commit; konfigurasi vault dasar di-commit.

## Struktur singkat

| Folder | Isi |
| :--- | :--- |
| `00 Mulai` | Indeks, cara pakai, peta belajar, quick reference |
| `01 Gambaran` | Produk, tech stack, repo map, peran |
| `02 Arsitektur` | Bootstrap, navigasi, state, data, domain, UI, AI, deploy |
| `03 Data Model` | Koleksi `localStorage`, relasi, ERD |
| `04 Alur Bisnis` | Booking, pembayaran, refund, jadwal, ledger, KYC, support |
| `05 Modul` | Peta layar dan modul per peran |
| `06 Konvensi` | Pola kode, UI, navigasi, mutasi data, technical debt |
| `07 Referensi` | Glosarium, function index, file index, akun demo, FAQ |
| `08 Jurnal` | Catatan sesi belajar dan pertanyaan terbuka |
| `09 Template` | Template catatan baru |
| `10 Aset` | Lampiran gambar |
| `99 Kanvas` | Canvas peta codebase dan alur booking |

## Integrasi agen

Agen AI yang bekerja di repo ini diarahkan lewat [`AGENTS.md`](../AGENTS.md) di root project.
Aturannya: baca indeks vault terlebih dahulu, lalu perbarui catatan terkait setelah mengubah kode.

> [!warning] Vault ini dokumentasi, bukan source of truth
> Source of truth tetap kode di `transaceh-react/`. Jika catatan dan kode berbeda, kode yang benar; catatan harus diperbarui.
