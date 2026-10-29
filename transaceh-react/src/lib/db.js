/* DB layer.
   - mode local: localStorage seperti sebelumnya (kunci at_*)
   - mode sheets: cache memori + antrean sync ke Apps Script. Hanya session,
     lang, checkout draft, dan tiket support guest yang tetap di localStorage.
   - Tulisan optimistis: cache berubah dulu, lalu dikirim sebagai diff per
     koleksi dengan baseRev. Bila server menolak, cache di-rollback dan
     pemanggil menerima notifikasi lewat setSyncErrorHandler().
   - flush() selalu selesai dengan { ok, err? }: ok:false berarti batch
     ditolak server (rollback sudah terjadi, handler sync sudah diberi tahu).
     Alur yang butuh kepastian, mis. pembayaran, menunggu hasil ini sebelum
     menampilkan toast sukses. */

import { IS_SHEETS } from './runtime.js';
import { sheetsApi, getToken } from './sheetsApi.js';

const LOCAL_KEYS = new Set(['session', 'lang', 'checkout_draft', 'guest_support_tickets']);
const cache = Object.create(null);
const serverSnapshot = Object.create(null);
const revisions = Object.create(null);
const dirty = new Set();

let syncTimer = null;
let inFlight = false;
let inFlightPromise = null;
let generation = 0;
let syncErrorHandler = null;

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function readLocal(k, f) {
  try {
    const v = localStorage.getItem('at_' + k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
}

function recordKey(rec) {
  if (!rec || typeof rec !== 'object') return '';
  if (rec.id != null && rec.id !== '') return String(rec.id);
  if (rec.key != null && rec.key !== '') return String(rec.key);
  if (rec._id != null && rec._id !== '') return String(rec._id);
  if (rec.code != null && rec.code !== '') return String(rec.code);
  return '';
}

function indexRecords(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((rec) => {
    const key = recordKey(rec);
    if (key) map.set(key, rec);
  });
  return map;
}

/** Diff satu koleksi. Hanya record yang benar-benar berubah yang dikirim. */
function diffCollection(prev, next) {
  if (Array.isArray(prev) || Array.isArray(next)) {
    const before = indexRecords(prev);
    const after = indexRecords(next);
    const upserts = [];
    const deletes = [];
    after.forEach((rec, key) => {
      const old = before.get(key);
      if (!old || JSON.stringify(old) !== JSON.stringify(rec)) upserts.push(rec);
    });
    before.forEach((_rec, key) => {
      if (!after.has(key)) deletes.push(key);
    });
    return { upserts, deletes };
  }
  /* Koleksi objek tunggal (mis. fees lama) belum dipakai UI; jangan kirim
     record tanpa id ke server. */
  return { upserts: [], deletes: [] };
}

function scheduleSync(delay = 40) {
  if (!IS_SHEETS || syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    flush();
  }, delay);
}

function buildChanges() {
  const changes = {};
  const snapshots = {};
  Array.from(dirty).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(cache, key)) {
      dirty.delete(key);
      return;
    }
    const prev = Object.prototype.hasOwnProperty.call(serverSnapshot, key) ? serverSnapshot[key] : [];
    const next = cache[key];
    const diff = diffCollection(prev, next);
    if (!diff.upserts.length && !diff.deletes.length) {
      dirty.delete(key);
      return;
    }
    changes[key] = {
      baseRev: Number(revisions[key] || 0) || 0,
      upserts: diff.upserts,
      deletes: diff.deletes,
    };
    snapshots[key] = clone(next);
  });
  return Object.keys(changes).length ? { changes, snapshots } : null;
}

/** Tempel pasangan {field: nilai} pada baris ber-id sama di buffer cache
    DAN snapshot server sekaligus, tanpa menandai kotor. Nilainya berasal
    dari server (bukan suntingan lokal) dan server melarang klien pelanggan
    menulis schedules/drivers — jadi tidak boleh berubah jadi diff tulis. */
function patchStoredFields_(key, id, patch) {
  const keys = Object.prototype.hasOwnProperty.call(serverSnapshot, key)
    ? [serverSnapshot, cache]
    : [cache];
  keys.forEach((store) => {
    const list = store[key];
    if (!Array.isArray(list)) return;
    const rec = list.find((r) => r && recordKey(r) === id);
    if (!rec) return;
    Object.keys(patch).forEach((field) => { rec[field] = patch[field]; });
  });
}

/** Terima catatan pengemudi tumpangan respons sync (scheduleNotes per jadwal
    tersentuh): tampalkan id/nama pengemudi pada baris jadwal + pastikan baris
    mini pengemudi {id, name, phone} tersedia, sehingga tiket pelanggan
    menampilkan nama/telepon pengemudi segera tanpa muat ulang. Tanpa menandai
    kotor — nilainya berasal dari server. */
function mergeScheduleNotes_(notes) {
  if (!notes || typeof notes !== 'object') return 0;
  let count = 0;
  Object.keys(notes).forEach((sid) => {
    const n = notes[sid];
    if (!n || typeof n !== 'object') return;
    const id = String(sid || '');
    if (!id) return;
    patchStoredFields_('schedules', id, {
      driverId: String(n.driverId || ''),
      driverName: String(n.driverName || ''),
      backupDriverId: String(n.backupDriverId || ''),
      backupName: String(n.backupName || '')
    });
    count += 1;
    const roles = [
      { idField: 'driverId', nameField: 'driverName', phoneField: 'driverPhone' },
      { idField: 'backupDriverId', nameField: 'backupName', phoneField: 'backupPhone' }
    ];
    roles.forEach((role) => {
      const did = String(n[role.idField] || '');
      if (!did) return;
      const name = typeof n[role.nameField] === 'string' ? n[role.nameField] : '';
      const phone = typeof n[role.phoneField] === 'string' ? n[role.phoneField] : '';
      [serverSnapshot, cache].forEach((store) => {
        const list = store.drivers;
        if (!Array.isArray(list)) return;
        const rec = list.find((d) => d && String(d.id || '') === did);
        if (rec) {
          if (name) rec.name = name;
          if (phone) rec.phone = phone;
        } else {
          list.push({ id: did, name, phone });
        }
      });
    });
  });
  return count;
}

async function flush() {
  if (!IS_SHEETS || inFlight || !dirty.size) {
    if (inFlightPromise) return inFlightPromise;
    return { ok: true };
  }
  const built = buildChanges();
  if (!built) return { ok: true };

  const token = getToken();
  if (!token) {
    /* Jangan kirim tulis tanpa sesi. Cache akan diganti saat login/bootstrap. */
    return { ok: true };
  }

  const gen = generation;
  const sentKeys = Object.keys(built.changes);
  inFlight = true;
  inFlightPromise = (async () => {
    try {
      const data = await sheetsApi.sync(token, built.changes);
      if (gen !== generation) return { ok: true };
      sentKeys.forEach((key) => {
        revisions[key] = Number((data && data.revisions && data.revisions[key]) || 0) || 0;
        if (key === 'users') {
          /* Jangan biarkan password plaintext tinggal di cache/snapshot dan
             terkirim ulang saat baris user lain berubah. */
          const strip = (list) => {
            (Array.isArray(list) ? list : []).forEach((rec) => {
              if (!rec || typeof rec !== 'object') return;
              delete rec.pass;
              delete rec.password;
            });
          };
          strip(cache[key]);
          strip(built.snapshots[key]);
        }
        serverSnapshot[key] = built.snapshots[key];
        if (JSON.stringify(cache[key]) !== JSON.stringify(built.snapshots[key])) dirty.add(key);
        else dirty.delete(key);
      });
      /* Nama/telepon pengemudi tumpangan respons — ditempel ke cache + snapshot
         supaya tiket lunas langsung menampilkan pengemudi tanpa muat ulang. */
      const notesCount = mergeScheduleNotes_(data && data.scheduleNotes);
      return { ok: true, notes: notesCount };
    } catch (err) {
      if (gen === generation) {
        sentKeys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(serverSnapshot, key)) {
            cache[key] = clone(serverSnapshot[key]);
          } else {
            delete cache[key];
          }
          dirty.delete(key);
        });
        if (syncErrorHandler) {
          Promise.resolve(syncErrorHandler(err)).catch(() => {});
        }
        return { ok: false, err };
      }
      /* Batch basi karena sesi berganti (login/logout) — dianggap netral. */
      return { ok: true };
    } finally {
      inFlight = false;
      inFlightPromise = null;
      if (dirty.size) scheduleSync(120);
    }
  })();
  return inFlightPromise;
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
      cache[k] = v;
      dirty.add(k);
      scheduleSync();
      return;
    }
    localStorage.setItem('at_' + k, JSON.stringify(v));
  },

  /** Isi cache dari respons bootstrap. Mengganti seluruh snapshot, bukan merge. */
  hydrate(records, revs) {
    if (!IS_SHEETS) return;
    generation += 1;
    this.clearCache();
    Object.keys(records || {}).forEach((k) => {
      cache[k] = records[k];
      serverSnapshot[k] = clone(records[k]);
    });
    Object.keys(revs || {}).forEach((k) => {
      revisions[k] = Number(revs[k] || 0) || 0;
    });
  },

  clearCache() {
    Object.keys(cache).forEach((k) => { delete cache[k]; });
    Object.keys(serverSnapshot).forEach((k) => { delete serverSnapshot[k]; });
    Object.keys(revisions).forEach((k) => { delete revisions[k]; });
    dirty.clear();
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  },

  clear() {
    generation += 1;
    this.clearCache();
  },

  /** Untuk diagnostik/UI: apakah koleksi ada di snapshot saat ini. */
  has(k) { return Object.prototype.hasOwnProperty.call(cache, k); },

  revision(k) { return Number(revisions[k] || 0) || 0; },

  pendingCount() { return dirty.size; },

  setSyncErrorHandler(fn) { syncErrorHandler = typeof fn === 'function' ? fn : null; },

  /** Kirim semua perubahan tertunda; dipakai saat logout / test. */
  flush() { return flush(); },
};
