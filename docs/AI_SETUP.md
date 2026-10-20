# Asisten AI TransAceh

Chatbot Pusat Bantuan memakai model NVIDIA `meta/muse-glimmer-30b` melalui Cloudflare Worker. Browser **tidak pernah** memegang API key NVIDIA.

## Arsitektur

```text
Browser (GitHub Pages / localhost)
        │  POST /api/chat  (JSON + SSE)
        ▼
Cloudflare Worker  ──►  NVIDIA integrate.api.nvidia.com
        │
        └── hanya membaca ringkasan booking/laporan milik user yang login
```

- `worker/src/index.js` — validasi request, CORS, prompt sistem, dan proxy streaming SSE.
- `src/lib/aiClient.js` — klien streaming browser; mengabaikan `reasoning_content`.
- `src/lib/aiContext.js` — ringkasan maksimal 5 booking dan 5 laporan milik user.
- `src/lib/aiPrompt.js` — aturan, FAQ, panduan, dan data pengguna untuk prompt.
- `src/pages/help/ChatSection.jsx` — UI streaming, stop, retry, dan fallback FAQ lokal.

## Menjalankan lokal

1. Salin contoh secret:

   ```powershell
   cd transaceh-react
   Copy-Item worker/.dev.vars.example worker/.dev.vars
   ```

2. Isi `worker/.dev.vars`:

   ```dotenv
   NVIDIA_API_KEY=nvapi-...
   ```

   File ini sudah masuk `.gitignore`. Jangan pernah commit.

3. Jalankan Worker:

   ```powershell
   npm run worker:dev
   ```

   Worker berjalan di `http://localhost:8787`. Cek:

   ```powershell
   curl.exe http://localhost:8787/health
   ```

4. Jalankan frontend di terminal lain:

   ```powershell
   npm run dev
   ```

   Saat development, frontend otomatis memakai `http://localhost:8787`. Jika ingin URL lain, buat `.env.local`:

   ```dotenv
   VITE_AI_PROXY_URL=http://localhost:8787
   ```

## Deploy produksi

1. Login Wrangler:

   ```powershell
   npx wrangler login
   ```

2. Simpan API key sebagai secret Worker (jangan lewat file yang di-commit):

   ```powershell
   npm run worker:secret
   ```

3. Deploy Worker:

   ```powershell
   npm run worker:deploy
   ```

   Catat URL Worker, misalnya `https://transaceh-ai.<subdomain>.workers.dev`.

4. Di GitHub repository, buka **Settings → Secrets and variables → Actions → Variables**, lalu tambahkan:

   ```text
   VITE_AI_PROXY_URL = https://transaceh-ai.<subdomain>.workers.dev
   ```

   Isi **URL dasar Worker**, bukan URL yang sudah berakhiran `/api/chat`. Workflow GitHub Pages meneruskan nilai ini saat build.

5. Jalankan ulang workflow **Deploy GitHub Pages** atau push ke `main`.

Jika `VITE_AI_PROXY_URL` kosong, aplikasi tetap berjalan memakai chatbot FAQ lokal.

## CORS dan domain

`worker/wrangler.toml` berisi daftar origin yang diizinkan:

```toml
ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://mavianandria-dev.github.io"
```

Tambahkan origin produksi lain (tanpa garis miring di akhir) jika domain berubah. Contoh:

```toml
ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://mavianandria-dev.github.io,https://transaceh.id"
```

Setelah mengubahnya, deploy ulang Worker.

## Model dan perilaku

- Model: `meta/muse-glimmer-30b`
- `temperature`: `0.5`
- `top_p`: `0.9`
- `max_tokens`: `1200` (dapat diubah lewat variabel `MAX_OUTPUT_TOKENS`)
- Prompt diawali `Reasoning strength: low`.
- Stream NVIDIA memuat `reasoning_content` lebih dulu. Frontend hanya menampilkan `delta.content`.
- Tombol stop membatalkan request lewat `AbortController`.
- Retry mengulang pertanyaan terakhir tanpa menggandakan riwayat.
- Jika Worker tidak tersedia, timeout, limit, atau error, jawaban jatuh ke FAQ lokal.

## Privasi dan keamanan

- API key hanya ada di secret Worker atau `worker/.dev.vars` (lokal, tidak di-commit).
- Jangan pernah memakai `VITE_NVIDIA_API_KEY` atau variabel `VITE_*` lain untuk secret; semua nilai `VITE_*` ikut ter-bundle ke JavaScript publik.
- Worker hanya menerima ringkasan:
  - maksimal 5 booking milik user login;
  - maksimal 5 laporan/chat milik user login;
  - tanpa email, nomor HP, nama penumpang, atau detail pembayaran.
- Pengunjung tanpa login tidak mengirim data booking/laporan.
- Worker tidak menyimpan transkrip. Riwayat AI hanya ada di memori tab browser dan tidak masuk inbox admin.
- Aplikasi ini masih memakai localStorage. Worker memvalidasi bentuk data, tetapi tidak memiliki sesi login untuk membuktikan kepemilikan data; isolasi dilakukan di `src/lib/aiContext.js`. Untuk jaminan penuh, gunakan backend terautentikasi.
- Tetap batasi penyalahgunaan di Cloudflare: buat **WAF rate limiting** untuk `POST /api/chat` (misalnya 20 request/menit per IP) dan pasang budget alert di NVIDIA.
- Rotasi API key NVIDIA secara berkala, terutama jika key pernah tampil di chat, screenshot, atau log.

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| `403 Origin tidak diizinkan` | Origin frontend tidak ada di `ALLOWED_ORIGINS` | Tambahkan origin persis, lalu deploy ulang |
| `503 Layanan AI belum dikonfigurasi` | Secret Worker belum diisi | Jalankan `npm run worker:secret` |
| `429 Asisten AI sedang sibuk` | Rate limit NVIDIA | Tunggu, lalu coba lagi; pertimbangkan WAF limit |
| Jawaban selalu dari FAQ lokal | `VITE_AI_PROXY_URL` kosong atau Worker error | Cek variable GitHub dan `/health` Worker |
| Streaming berhenti sendiri | Timeout 90 detik atau koneksi terputus | Klik **Coba lagi** |

## Perintah berguna

```powershell
npm run worker:dev       # Worker lokal
npm run worker:deploy    # Deploy Worker
npm run worker:secret    # Set/rotate NVIDIA_API_KEY
npm run lint
npm run build
```
