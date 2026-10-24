---
title: Cara Pakai Vault
type: panduan
area: navigasi
tags:
  - type/note
  - area/navigasi
status: aktif
updated: 2026-10-24
source: []
---

# Cara Pakai Vault

## Membuka di Obsidian

1. Buka Obsidian → **Open folder as vault**.
2. Pilih folder `Assist-Agent` (bukan root project).
3. Buka [[00 Index]].
4. Gunakan **Graph View** untuk melihat hubungan catatan, dan **Backlinks** untuk melihat catatan yang merujuk ke halaman aktif.

## Navigasi

- **Wikilink** `[[00 Index]]` menghubungkan catatan.
- **MOC** (Map of Content) adalah halaman hub; mulai dari MOC, bukan mencari file satu per satu.
- **Tag** memungkinkan filter lintas folder:
  - `#type/moc` — hub
  - `#area/arsitektur` — arsitektur
  - `#area/data` — data model
  - `#area/alur` — alur bisnis
  - `#area/modul` — modul/layar
  - `#area/referensi` — referensi
- **Search** (`Ctrl+Shift+F`) mencari teks di seluruh vault.
- **Canvas** ada di folder `99 Kanvas`.

## Frontmatter

Contoh:

```yaml
---
title: Nama Catatan
type: catatan
area: arsitektur
tags:
  - type/note
  - area/arsitektur
status: aktif
updated: 2026-10-23
source:
  - transaceh-react/src/lib/domain.js
---
```

Nilai `status`: `aktif`, `perlu-review`, atau `arsip`.

## Menulis catatan baru

1. Pilih template di `09 Template`.
2. Simpan di folder yang sesuai.
3. Tambahkan tautan dari MOC terkait agar tidak menjadi orphan.
4. Tulis path sumber dan nomor baris jika relevan.
5. Perbarui `updated`.

## Memperbarui catatan setelah kode berubah

1. Cari catatan yang menyebut file/fungsi terkait (Search).
2. Verifikasi perilaku baru di kode.
3. Perbarui isi, path, dan nomor baris.
4. Ubah `updated`.
5. Jika perubahan besar, catat di [[Jurnal Belajar]].

## Yang tidak boleh dilakukan

- Menyalin seluruh file kode ke catatan.
- Membuat tautan ke catatan yang belum ada.
- Menganggap catatan sebagai pengganti membaca kode.
- Mengubah catatan untuk menutupi bug; catat bug di [[Pertanyaan Terbuka]] atau [[Technical Debt dan Jebakan]].
