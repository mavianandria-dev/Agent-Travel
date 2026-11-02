/* Alur auth + bootstrap mode Sheets. Dipakai boot dan halaman Auth. */

import { DB } from './db.js';
import { currentUser, setSession } from './domain.js';
import { sheetsApi, setToken, clearToken, getToken } from './sheetsApi.js';
import { IS_SHEETS } from './runtime.js';

/* Catatan tarik snapshot terakhir (semua jalur, termasuk login) — dipakai
   pullSnapshotSoft sebagai rem supaya momen "masuk halaman / kembali ke
   layar" yang berkumpul tidak membanjiri Apps Script dengan bootstrap. */
let lastSnapshotPull = 0;
let softPullInflight = null;

/** Tarik snapshot segar secara "lembut": melewatkan tarikan yang terjadi
 *  kurang dari ~8 dtk sejak tarik mana pun terakhir dimulai, serta tidak
 *  menumpuk dua tarikan bersamaan. Gagal jaringan dibungkam — data lama
 *  di cache tetap tampil, momen tarik berikutnya boleh mencoba lagi.
 *  Mengembalikan true HANYA bila tarikan benar-benar dijalankan; pemanggil
 *  memanggil refresh() sendiri setelah janji selesai (hydrate sudah terjadi). */
export async function pullSnapshotSoft() {
  if (!IS_SHEETS) return false;
  if (softPullInflight) return false;
  if (Date.now() - lastSnapshotPull < 8000) return false;
  const job = refreshSnapshot()
    .then(() => true)
    .catch(() => false)
    .finally(() => { softPullInflight = null; });
  softPullInflight = job;
  return job;
}

export async function loadSnapshot(token) {
  lastSnapshotPull = Date.now();
  const snap = await sheetsApi.bootstrap(token || null);
  DB.hydrate(snap.records, snap.revisions);
  return snap;
}

/** Muat ulang data sesi aktif dari server tanpa login ulang: antrean tulis
    lokal didorong dulu, lalu snapshot server mengganti cache. Row `session`
    diisi ulang karena hydrate mengganti seluruh snapshot (bukan merge). */
export async function refreshSnapshot() {
  const me = currentUser();
  try { await DB.flush(); } catch { /* tetap coba ambil kondisi terkini */ }
  const snap = await loadSnapshot(getToken());
  setSession(me || snap.user || null);
  return snap;
}

export async function signInRemote(email, password) {
  const data = await sheetsApi.login(email, password);
  /* Antrean sel sesi lama harus keluar dulu dengan token LAMA, sebelum token
     baru dipasang. Kalau tidak, flush yang tertunda bisa terkirim memakai
     identitas akun baru dan ditolak server (mis. "Akun ini sudah punya data
     pengemudi."). getToken() saat ini masih token lama. */
  try { await DB.flush(); } catch { /* tulisan gagal ditangani sync error handler */ }
  setToken(data.token, data.expiresAt);
  try {
    const snap = await loadSnapshot(data.token);
    const user = snap.user || data.user;
    setSession(user);
    return user;
  } catch (e) {
    clearToken();
    throw e;
  }
}

export async function registerRemote(payload) {
  const data = await sheetsApi.register(payload);
  if (data.token) {
    setToken(data.token, data.expiresAt);
    try {
      const snap = await loadSnapshot(data.token);
      setSession(snap.user || data.user);
    } catch (e) {
      clearToken();
      throw e;
    }
  }
  return data;
}

export async function signOutRemote() {
  try {
    await DB.flush();
  } catch { /* tetap keluar walau sinkronisasi terakhir gagal */ }
  clearToken();
  setSession(null);
  DB.clear();
  const snap = await sheetsApi.bootstrap(null);
  DB.hydrate(snap.records, snap.revisions);
  return snap;
}
