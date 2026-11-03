/* Gambar kota tujuan — dipipihkan di browser sebelum masuk Sheets.
   Penyimpanan: dataURL JPEG dalam SATU sel (batas sel server 45.000
   karakter, API_MAX_CELL_CHARS di code.gs). Dipakai kartu "Pilih Rute
   Perjalanan" publik (belahan kiri asal, kanan tujuan) → target maksimal
   yang masih aman: dataURL ≤ ±42.000 karakter (~31,5 KB/kota; validator
   server 44.000, sel Sheets 45.000). Sisi terpanjang mulai 512 px (3×
   ukuran tampil di kartu — tajam di layar retina), mutu JPEG diturunkan
   0,82 → 0,60, lalu sisi menyusut 12% per putaran — turunkan piksel,
   bukan mutu. */
import { dataUrlBytes } from '@/lib/upload.js';

export const CITY_IMAGE_TARGET_CHARS = 42000;
export const CITY_IMAGE_MAX_CHARS = 44000; /* ditegakkan juga di server */
const SIDE_START = 512;

/** Id rekord deterministik dari nama kota → unggah ulang = update rekord
    yang sama, tidak mendobel (server menegakkan satu rekord per kota). */
export function cityImageId(city) {
  const slug = String(city || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return 'ci_' + (slug || 'x');
}

/** Baca file gambar → { dataUrl, mime, bytes, width, height }. Melempar
    pesan siap-tampil bila file bukan gambar/gagal dipipihkan. */
export function cityImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type || '')) {
      reject(new Error('Pilih berkas gambar (JPG/PNG)'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const base = Math.max(img.width, img.height) || 1;
      let side = SIDE_START;
      for (let round = 0; round < 14; round += 1) {
        const scale = Math.min(1, side / base);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        for (let q = 0.82; q >= 0.60; q -= 0.08) {
          const dataUrl = cv.toDataURL('image/jpeg', q);
          if (dataUrl.length <= CITY_IMAGE_TARGET_CHARS) {
            resolve({ dataUrl, mime: 'image/jpeg', bytes: dataUrlBytes(dataUrl), width: w, height: h });
            return;
          }
        }
        side = Math.round(side * 0.88);
      }
      reject(new Error('Gambar terlalu besar — pilih foto yang lebih kecil'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar tidak bisa dibaca'));
    };
    img.src = url;
  });
}
