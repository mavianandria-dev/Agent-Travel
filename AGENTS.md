# AGENTS.md — Memori Proyek TransAceh

Repo ini memiliki vault memori jangka panjang di `Assist-Agent/`.
Vault tersebut berisi peta codebase, model data, alur bisnis, konvensi, dan catatan belajar.

## Wajib dibaca sebelum bekerja

Untuk tugas yang menyentuh kode aplikasi, baca minimal:

1. `Assist-Agent/00 Mulai/00 Index.md`
2. `Assist-Agent/01 Gambaran/Peta Repository.md`
3. `Assist-Agent/01 Gambaran/Peran dan Hak Akses.md`
4. Catatan yang relevan dengan area tugas, misalnya:
   - Booking/pembayaran → `Assist-Agent/04 Alur Bisnis/Alur Booking dan Checkout.md`
   - Refund/ledger → `Assist-Agent/04 Alur Bisnis/Alur Pembatalan dan Refund.md`
   - Data → `Assist-Agent/03 Data Model/00 Data Model MOC.md`
   - AI/support → `Assist-Agent/02 Arsitektur/Pusat Bantuan dan AI.md`

## Aturan kerja

- Bahasa catatan: Indonesia.
- Source of truth adalah kode di `transaceh-react/`, bukan catatan.
- Jangan menyalin blok kode panjang ke vault; jelaskan perilaku dan tunjuk path/line.
- Setelah mengubah kode, perbarui catatan yang terdampak:
  - perbarui bagian isi,
  - perbarui `updated` di frontmatter,
  - perbarui path/nomor baris di bagian **Sumber**.
- Jika perubahan bersifat arsitektural atau keputusan desain, tambahkan entri di `Assist-Agent/08 Jurnal/`.
- Jaga semua `[[wikilink]]` tetap valid; jangan membuat tautan ke catatan yang tidak ada.
- Jika menemukan catatan usang, perbaiki atau tandai `status: perlu-review`.

## Invariants penting

- Data aplikasi disimpan di `localStorage` dengan prefix `at_` melalui `transaceh-react/src/lib/db.js`.
- Navigasi memakai state `view` di `AppContext`, bukan React Router.
- Logika bisnis utama ada di `transaceh-react/src/lib/domain.js`.
- Data awal dan migrasi ada di `transaceh-react/src/lib/seed.js`.
- Ada empat peran: `pelanggan`, `agen`, `pengemudi`, `superadmin`.
- Pembayaran dan refund adalah simulasi; tidak ada payment gateway nyata.
- API key NVIDIA tidak boleh masuk frontend; hanya di secret Cloudflare Worker.

## Jangan

- Jangan mengubah file di `Assist-Agent/` untuk kebutuhan fitur aplikasi.
- Jangan menambahkan dependency hanya untuk dokumentasi.
- Jangan menganggap catatan lebih baru daripada kode; verifikasi ke source.
