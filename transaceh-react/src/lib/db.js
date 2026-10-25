/* DB layer.
   - mode local: localStorage seperti sebelumnya (kunci at_*)
   - mode sheets: cache memori hasil bootstrap; hanya session/checkout draft
     yang tetap di localStorage. Fase B belum punya jalur tulis remote. */

import { IS_SHEETS } from './runtime.js';

const LOCAL_KEYS = new Set(['session', 'lang', 'checkout_draft']);
const cache = Object.create(null);

function readLocal(k, f) {
  try {
    const v = localStorage.getItem('at_' + k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
}

export const DB = {
  isRemote() { return IS_SHEETS; },

  isLocalKey(k) { return LOCAL_KEYS.has(k); },

  load(k, f) {
    if (IS_SHEETS && !LOCAL_KEYS.has(k)) {
      return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : f;
    }
    return readLocal(k, f);
  },

  save(k, v) {
    if (IS_SHEETS && !LOCAL_KEYS.has(k)) {
      throw new Error('Mode Sheets masih baca-saja. Perubahan data belum didukung sampai Fase C.');
    }
    localStorage.setItem('at_' + k, JSON.stringify(v));
  },

  /** Isi cache dari respons bootstrap. Mengganti seluruh snapshot, bukan merge. */
  hydrate(records) {
    if (!IS_SHEETS) return;
    this.clear();
    Object.keys(records || {}).forEach((k) => {
      cache[k] = records[k];
    });
  },

  clear() {
    Object.keys(cache).forEach((k) => { delete cache[k]; });
  },

  /** Untuk diagnostik/UI: apakah koleksi ada di snapshot saat ini. */
  has(k) { return Object.prototype.hasOwnProperty.call(cache, k); },
};
