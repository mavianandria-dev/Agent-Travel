/* Unggahan dokumen KYC: gambar dikompres di browser, PDF disimpan apa adanya.
   Semua tersimpan sebagai dataURL di localStorage, jadi ukurannya harus dijaga. */

export const DOC_ACCEPT = 'image/*,application/pdf';
export const PDF_MAX_BYTES = 700 * 1024;
export const IMG_MAX_DIM = 1000;
export const IMG_QUALITY = 0.72;
/* localStorage ±5MB untuk seluruh aplikasi — sisakan ruang untuk data lain. */
export const DOCS_BUDGET_BYTES = 3.5 * 1024 * 1024;

/** Ukuran asli dataURL dalam byte (panjang base64 → byte). */
export function dataUrlBytes(dataUrl) {
  const s = String(dataUrl || '');
  const i = s.indexOf(',');
  const b64 = i >= 0 ? s.slice(i + 1) : s;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** Ukuran file dalam teks singkat: 148 KB / 1,2 MB. */
export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}

/** Total ukuran semua dokumen yang tersimpan. */
export function docsBytes(docs) {
  return Object.values(docs || {}).reduce((n, d) => n + dataUrlBytes(d && d.dataUrl), 0);
}

/** Kompres gambar → maksimal IMG_MAX_DIM px, JPEG kualitas IMG_QUALITY. */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, IMG_MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL('image/jpeg', IMG_QUALITY);
      resolve({ dataUrl, name: file.name, type: 'image/jpeg', size: dataUrlBytes(dataUrl) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca')); };
    img.src = url;
  });
}

/** PDF tidak bisa dikompres di browser — simpan apa adanya dengan batas ukuran. */
export function readPdf(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ dataUrl: r.result, name: file.name, type: 'application/pdf', size: file.size });
    r.onerror = () => reject(new Error('File tidak bisa dibaca'));
    r.readAsDataURL(file);
  });
}

/** Pilih jalur simpan sesuai tipe file; melempar pesan siap tampil bila ditolak. */
export async function fileToDoc(file) {
  if (file.type === 'application/pdf') {
    if (file.size > PDF_MAX_BYTES) throw new Error('PDF maksimal ' + formatBytes(PDF_MAX_BYTES) + ' — kalau lebih, foto/screenshot halamannya');
    return readPdf(file);
  }
  if (!/^image\//.test(file.type || '')) throw new Error('Hanya gambar (JPG/PNG) atau PDF');
  return compressImage(file);
}
