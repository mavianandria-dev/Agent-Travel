/**
 * Mock harness untuk menguji `code.gs` (Apps Script) di lokal via Node + vm.
 * Tidak menyentuh spreadsheet Google; semua I/O di-mock supaya perilaku
 * code.gs bisa diverifikasi sebelum dipasang di produksi.
 *
 * Cara jalankan: node google-apps-script/local-tests/mock-harness.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, '..', 'code.gs'), 'utf8');
const seedSource = readFileSync(path.join(__dirname, '..', 'seed.gs'), 'utf8');

/* ------------------------------------------------------------------ */
/* Mock Spreadsheet                                                    */
/* ------------------------------------------------------------------ */

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.numRows; i++) {
      const src = this.sheet.rows[this.row - 1 + i] || [];
      const line = [];
      for (let j = 0; j < this.numCols; j++) {
        const v = src[this.col - 1 + j];
        line.push(v == null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    for (let i = 0; i < values.length; i++) {
      const rowIndex = this.row - 1 + i;
      while (this.sheet.rows.length <= rowIndex) this.sheet.rows.push([]);
      const line = this.sheet.rows[rowIndex];
      const src = values[i];
      for (let j = 0; j < src.length; j++) line[this.col - 1 + j] = src[j];
    }
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((v) => String(v == null ? '' : v)));
  }
  clearContent() {
    for (let i = 0; i < this.numRows; i++) {
      const line = this.sheet.rows[this.row - 1 + i];
      if (!line) continue;
      for (let j = 0; j < this.numCols; j++) line[this.col - 1 + j] = '';
    }
    return this;
  }
}

class MockSheet {
  constructor(name) { this.name = name; this.rows = []; }
  getLastRow() {
    let lastRow = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i] || [];
      if (row.some((cell) => String(cell == null ? '' : cell).trim() !== '')) lastRow = i + 1;
    }
    return lastRow;
  }
  getLastColumn() {
    let lastCol = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i] || [];
      for (let j = row.length - 1; j >= lastCol; j--) {
        if (String(row[j] == null ? '' : row[j]).trim() !== '') { lastCol = j + 1; break; }
      }
    }
    return lastCol;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this, row, col, numRows, numCols);
  }
  clearContents() { this.rows = []; return this; }
  /* Semantik Apps Script: posisi berbasis 1, sisanya bergeser ke kiri/atas. */
  deleteRow(rowPosition) {
    const idx = Number(rowPosition) - 1;
    if (idx >= 0 && idx < this.rows.length) this.rows.splice(idx, 1);
    return this;
  }
  deleteColumn(colPosition) {
    const idx = Number(colPosition) - 1;
    if (idx >= 0) {
      for (let i = 0; i < this.rows.length; i++) {
        const row = this.rows[i];
        if (idx < row.length) row.splice(idx, 1);
      }
    }
    return this;
  }
  setNumberFormat() { return this; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
}

class MockSpreadsheet {
  constructor() { this.sheetMap = new Map(); }
  getSheetByName(name) { return this.sheetMap.get(name) || null; }
  addSheet(name) {
    const sheet = new MockSheet(name);
    this.sheetMap.set(name, sheet);
    return sheet;
  }
  insertSheet(name) { return this.addSheet(name); }
  deleteSheet(sheet) {
    if (sheet && this.sheetMap.get(sheet.name) === sheet) this.sheetMap.delete(sheet.name);
  }
  getSheets() { return Array.from(this.sheetMap.values()); }
}

/* ------------------------------------------------------------------ */
/* Mock layanan Apps Script                                            */
/* ------------------------------------------------------------------ */

const spread = new MockSpreadsheet();
const scriptProperties = new Map();
const logs = [];
const responses = [];
const cacheStore = new Map();
const sleepCalls = [];

class ScriptProperties {
  getProperty(key) { return scriptProperties.get(String(key)) || null; }
  setProperty(key, value) { scriptProperties.set(String(key), String(value)); }
  deleteProperty(key) { scriptProperties.delete(String(key)); }
  getKeys() { return Array.from(scriptProperties.keys()); }
}

class MockLock {
  tryLock() { return true; }
  releaseLock() {}
}

const Utilities = {
  getUuid: () => crypto.randomUUID(),
  base64EncodeWebSafe: (value) => {
    const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  base64Decode: (value) => {
    const text = String(value).replace(/-/g, '+').replace(/_/g, '/');
    return Array.from(Buffer.from(text, 'base64'));
  },
  computeHmacSha256Signature: (value, key) => {
    const kb = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
    const vb = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    return Array.from(crypto.createHmac('sha256', kb).update(vb).digest());
  },
  computeDigest: (algo, value, charset) => {
    const buf = Buffer.from(String(value), 'utf8');
    const hash = (algo === 'SHA_512') ? 'sha512' : 'sha256';
    return Array.from(crypto.createHash(hash).update(buf).digest());
  },
  DigestAlgorithm: { SHA_512: 'SHA_512', SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  newBlob: (data) => ({
    getDataAsString: () => Buffer.from(data).toString('utf8'),
    getData: () => data
  }),
  sleep: (ms) => { sleepCalls.push(Number(ms) || 0); }
};

const CacheService = {
  getScriptCache: () => ({
    get: (key) => (cacheStore.has(String(key)) ? cacheStore.get(String(key)) : null),
    put: (key, value) => { cacheStore.set(String(key), String(value)); },
    remove: (key) => { cacheStore.delete(String(key)); }
  })
};

const ContentService = {
  MimeType: { JSON: 'JSON' },
  createTextOutput: (text) => {
    const out = { text };
    out.setMimeType = () => out;
    return out;
  }
};

const Logger = {
  log: (msg) => logs.push(String(msg))
};

const sandbox = {
  Utilities,
  CacheService,
  ContentService,
  Logger,
  LockService: { getScriptLock: () => new MockLock() },
  PropertiesService: { getScriptProperties: () => new ScriptProperties() },
  SpreadsheetApp: {
    flush: () => {},
    getActiveSpreadsheet: () => spread
  }
};

vm.createContext(sandbox);
try {
  new vm.Script(source).runInContext(sandbox);
  new vm.Script(seedSource).runInContext(sandbox);
} catch (err) {
  console.error('PARSE/LOAD ERROR:', err.stack || err.message);
  process.exit(1);
}

const S = sandbox;
const seedKeys = S.API_COLLECTION_KEYS;

/* Secret dibuat sebelum fixture supaya hash password fixture memakai pepper
   runtime yang sama dengan semua alur login selama pengujian. */
S.setupBackend();

/* ------------------------------------------------------------------ */
/* Fixture data                                                        */
/* ------------------------------------------------------------------ */

const LEGACY_ADMIN_PW = 'legacy-plaintext-admin-pw';
const LEGACY_AGEN_PW = 'legacy-plaintext-agen-pw';
const LEGACY_AGEN2_PW = 'legacy-plaintext-agen2-pw';
const LEGACY_DRIVER1_PW = 'legacy-plaintext-driver1-pw';
const LEGACY_CUST1_PW = 'legacy-plaintext-cust1-pw';
const LEGACY_CUST2_PW = 'legacy-plaintext-cust2-pw';
const NEW_ADMIN_PW = 'new-pw-fixture-42';
const REG_PAX_PW = 'newcust-pw-123';
const REG_AGEN_PW = 'newagen-pw-123';
const THROTTLE_PW = 'throttle-pw-123';
const CHPW_PW = 'chpw-pw-123';
const NEW_CUST2_PW = 'cust2-new-pw-456';
const CHPW_FINAL_PW = 'chpw-final-pw-321';
const DRIVER_NEW_PW = 'driver-baru-pw-123';
const AGEN_NEW_PW = 'agen-baru-pw-123';

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/* Semua tab (utama + anak) dibuat dari skema backend supaya bentuk kolom
   identik dengan spreadsheet produksi yang di-seed lewat setup. */
const storeSchema = S.apiDescribeStore_();
storeSchema.tables.forEach((table) => {
  const sheet = spread.getSheetByName(table.name) || spread.addSheet(table.name);
  sheet.rows = [];
  sheet.rows.push([...table.headers]);
});
const metaSheet = spread.getSheetByName('_meta') || spread.addSheet('_meta');
metaSheet.rows = [];
metaSheet.rows.push(['key', 'value']);
metaSheet.rows.push(['schemaVersion', '2']);
metaSheet.rows.push(['seedVersion', 'production-2']);
metaSheet.rows.push(['storage', 'columns-v2']);
metaSheet.rows.push(['databaseMode', 'produksi-minimal']);
metaSheet.rows.push(['seededAt', '2026-10-24T00:00:00.000Z']);
metaSheet.rows.push(['seededBy', 'admin@transaceh.id']);
metaSheet.rows.push(['lastMutationAt', '2026-10-24T00:00:00.000Z']);
metaSheet.rows.push(['collections', JSON.stringify(seedKeys)]);
metaSheet.rows.push(['tableCount', String(storeSchema.tables.length)]);
metaSheet.rows.push(['collectionCount', String(seedKeys.length)]);
seedKeys.forEach((key) => metaSheet.rows.push(['rev.' + key, '1']));

/* Fixture ditulis lewat jalur tulis engine (apiWriteCollection_) supaya
   normalisasi kolom v2 ikut teruji sejak seeding. */
function seedCollection(key, records) {
  S.apiWriteCollection_(spread, key, records);
}

/** Baca satu record via jalur baca engine (tab kolom, bukan JSON). */
function readRec(key, id) {
  const found = S.apiReadCollection_(spread, key).find((r) => String(r.id) === String(id));
  return found || null;
}

/* Fixture password diprakasakan lewat apiHashForUser_ (kolom plaintext tidak
   ada di skema v2; arsip plaintext lama tidak pernah ikut ter-seed). */
function withHash(record, password) {
  const copy = Object.assign({}, record);
  delete copy.pass;
  delete copy.password;
  S.apiHashForUser_(copy, password, S.apiConfig_());
  return copy;
}

/* --- comparator round-trip nirkalan untuk storage kolom ---------------- */

function scalarNorm(value) {
  if (value === null || value === undefined) return '';
  if (value === true) return 'true';
  if (value === false) return 'false';
  return value;
}

function scalarEqual(a, b) {
  const na = scalarNorm(a);
  const nb = scalarNorm(b);
  if (typeof na === 'number' || typeof nb === 'number') {
    const numA = Number(na);
    const numB = Number(nb);
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA === numB;
  }
  return String(na) === String(nb);
}

function schemaRecordsEqual(aRecs, bRecs) {
  if (!Array.isArray(aRecs) || !Array.isArray(bRecs) || aRecs.length !== bRecs.length) {
    console.log('  roundtrip: panjang koleksi beda (' + (aRecs || []).length + ' vs ' + (bRecs || []).length + ')');
    return false;
  }
  let equal = true;
  for (let i = 0; i < aRecs.length; i++) {
    if (!schemaValueEqual(aRecs[i], bRecs[i], 'rec[' + ((aRecs[i] || {}).id || i) + ']')) equal = false;
  }
  return equal;
}

function schemaValueEqual(a, b, path) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      console.log('  roundtrip', path, 'bentuk array beda');
      return false;
    }
    if (a.length !== b.length) {
      console.log('  roundtrip', path, 'panjang array beda (' + a.length + ' vs ' + b.length + ')');
      return false;
    }
    let equal = true;
    for (let i = 0; i < a.length; i++) {
      if (!schemaValueEqual(a[i], b[i], path + '[' + i + ']')) equal = false;
    }
    return equal;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    let equal = true;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!schemaValueEqual(a[k], b[k], path + '.' + k)) equal = false;
    }
    return equal;
  }
  const eq = scalarEqual(a, b);
  if (!eq) console.log('  roundtrip', path, 'nilai beda:', JSON.stringify(a), 'vs', JSON.stringify(b));
  return eq;
}

function seedDoc(label) {
  return {
    name: label,
    type: 'image/png',
    size: 48000 + label.length,
    dataUrl: 'data:image/png;base64,AAAA' + label.replace(/\s+/g, ''),
    at: '2026-10-01T00:00:00.000Z'
  };
}
const kyc1 = {
  jenis: 'Perorangan / Freelance',
  nama: 'H. Muhammad Nur',
  nik: '1173010101800001',
  npwp: '12.345.678.9-101.000',
  bank: 'BCA',
  rekeningNo: '8210-9921-11',
  rekeningNama: 'Barakah Travel',
  status: 'lengkap', step: 3, terms: true,
  submittedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  docs: {
    ktp: seedDoc('KTP Barakah'),
    npwpPribadi: seedDoc('NPWP Barakah'),
    bukuTabungan: seedDoc('Rekening Barakah')
  }
};
const kyc2 = {
  jenis: 'Perorangan / Freelance',
  nama: 'Cut Putra',
  nik: '1171010101850002',
  npwp: '98.765.432.1-101.000',
  bank: 'Mandiri',
  rekeningNo: '8900-1122-33',
  rekeningNama: 'Putra Jaya',
  status: 'pending', step: 2, terms: true,
  submittedAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  docs: {
    ktp: seedDoc('KTP PutraJaya'),
    pasfoto: seedDoc('Pasfoto PutraJaya')
  }
};

seedCollection('users', [
  withHash({ id: 'u_admin_1', name: 'Admin Utama', email: 'admin@transaceh.id', phone: '0812000000', role: 'superadmin', status: 'active' }, LEGACY_ADMIN_PW),
  withHash({ id: 'u_agen_1', name: 'Agen Barakah', email: 'agen1@test.local', phone: '0812000001', role: 'agen', agencyId: 'ag_1', status: 'active' }, LEGACY_AGEN_PW),
  withHash({ id: 'u_agen_2', name: 'Agen Putra Jaya', email: 'agen2@test.local', phone: '0812000002', role: 'agen', agencyId: 'ag_2', status: 'active' }, LEGACY_AGEN2_PW),
  withHash({ id: 'u_driver_1', name: 'Bang Jamil', email: 'driver1@test.local', phone: '0812000003', role: 'pengemudi', agencyId: 'ag_1', status: 'active', profileStep: 'done' }, LEGACY_DRIVER1_PW),
  withHash({ id: 'u_driver_3', name: 'Bang Hendra', email: 'driver3@test.local', phone: '0812000004', role: 'pengemudi', agencyId: 'ag_2', status: 'active', profileStep: 'done' }, LEGACY_DRIVER1_PW),
  withHash({ id: 'u_cust_1', name: 'Rina Amelia', email: 'cust1@test.local', phone: '0812000005', role: 'pelanggan', status: 'active', favorites: [] }, LEGACY_CUST1_PW),
  withHash({ id: 'u_cust_2', name: 'Dedi Pelanggan', email: 'cust2@test.local', phone: '0812000006', role: 'pelanggan', status: 'active', favorites: [] }, LEGACY_CUST2_PW)
]);

seedCollection('agencies', [
  {
    id: 'ag_1', name: 'Barakah Travel', logo: '', address: 'Jl. Merdeka No.12, Calang',
    phone: '0654-20112', bank: 'BCA 8210-9921-11 a.n. Barakah Travel', status: 'active',
    feeType: 'percent', feeValue: 8,
    refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }],
    rating: 4.8, trips: 120, kyc: kyc1
  },
  {
    id: 'ag_2', name: 'Putra Jaya', logo: '', address: 'Jl. T. Umar No.88, Banda Aceh',
    phone: '0651-77821', bank: 'Mandiri 8900-1122-33 a.n. Putra Jaya', status: 'active',
    feeType: 'percent', feeValue: 10,
    refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }],
    rating: 4.6, trips: 80, kyc: kyc2
  },
  {
    id: 'ag_new', name: 'Travel Baru', logo: '', address: 'Jl. Baru No.1', phone: '0651-000000',
    bank: '-', status: 'pending', feeType: 'percent', feeValue: 8,
    refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }],
    rating: 5.0, trips: 0
  },
  {
    id: 'ag_4', name: 'Cahaya Perkasa', logo: '', address: 'Jl. Diponegoro No.7', phone: '0655-31212',
    bank: '-', status: 'pending', feeType: 'percent', feeValue: 8,
    refundPolicy: [{ minH: 72, pct: 100 }, { minH: 24, pct: 50 }, { minH: 0, pct: 0 }],
    rating: 5.0, trips: 0
  }
]);

seedCollection('routes', [
  { id: 'rt_1', from: 'Calang', to: 'Banda Aceh', distance: '170 km', duration: '4 j', prices: { ag_1: 150000, ag_2: 160000 }, agencyIds: ['ag_1', 'ag_2'] },
  { id: 'rt_2', from: 'Banda Aceh', to: 'Medan', distance: '430 km', duration: '10 j', prices: { ag_2: 260000 }, agencyIds: ['ag_2'] }
]);

seedCollection('vehicles', [
  {
    id: 'v_1', agencyId: 'ag_1', brand: 'Toyota', model: 'Innova Reborn', year: 2022,
    color: 'Hitam', plate: 'BL 1234 AA', chassis: 'MHFXW41G2N2001001', engine: '2GD2001001',
    vtype: 'MPV', baggage: 'Besar', capacity: 6, photo: '', facilities: ['AC', 'USB'],
    status: 'aktif', ownerName: 'H. Muhammad Nur', ownerNik: '1173010101800001',
    ownerPhone: '0812000001', stnkPhoto: 'data:image/png;base64,AAAASTNK1',
    inactiveSeats: ['A5'], layout: [], mainRoute: 'Calang — Banda Aceh',
    origin: 'Aceh Jaya', dest: 'Banda Aceh', services: ['Antar jemput'], opSchedule: '07:00'
  },
  {
    id: 'v_2', agencyId: 'ag_1', brand: 'Daihatsu', model: 'Xenia', year: 2021,
    color: 'Silver', plate: 'BL 5678 BB', chassis: 'MHKV1AA2JK2001002', engine: '1NR2001002',
    vtype: 'MPV', baggage: 'Sedang', capacity: 6, photo: '', facilities: ['AC'],
    status: 'aktif', ownerName: 'H. Muhammad Nur', ownerNik: '1173010101800001',
    ownerPhone: '0812000001', stnkPhoto: 'data:image/png;base64,AAAASTNK2',
    inactiveSeats: [], layout: [], mainRoute: 'Calang — Banda Aceh',
    origin: 'Aceh Jaya', dest: 'Banda Aceh', services: [], opSchedule: '14:00'
  },
  {
    id: 'v_4', agencyId: 'ag_2', brand: 'Suzuki', model: 'Ertiga', year: 2021,
    color: 'Merah', plate: 'BL 3344 DD', chassis: 'MHYNC22S1MJ100004', engine: 'K15B100004',
    vtype: 'MPV', baggage: 'Sedang', capacity: 6, photo: '', facilities: ['AC'],
    status: 'aktif', ownerName: '', ownerNik: '1171010101850002',
    ownerPhone: '0812000010', stnkPhoto: 'data:image/png;base64,AAAASTNK4',
    inactiveSeats: [], layout: [], mainRoute: 'Banda Aceh — Medan',
    origin: 'Banda Aceh', dest: 'Medan', services: [], opSchedule: '10:00'
  },
  {
    id: 'v_pending', agencyId: 'ag_4', brand: 'Toyota', model: 'Avanza', year: 2020,
    color: 'Putih', plate: 'BL 9999 ZZ', chassis: 'MHFDG...', engine: '1NR...',
    vtype: 'MPV', baggage: 'Sedang', capacity: 6, photo: '', facilities: ['AC'],
    status: 'aktif', ownerName: 'Pemilik Pending', ownerNik: '1173010709910013',
    ownerPhone: '0812000099', stnkPhoto: 'data:image/png;base64,AAAAPENDING',
    inactiveSeats: [], layout: [], mainRoute: '', origin: '', dest: '',
    services: [], opSchedule: ''
  }
]);

seedCollection('drivers', [
  { id: 'd_1', agencyId: 'ag_1', name: 'Bang Jamil', phone: '0812000003', simType: 'A', simExp: 2030, simPhoto: 'data:image/png;base64,AAAASIM1', ktpPhoto: 'data:image/png;base64,AAAAKTPD1', photo: '', status: 'aktif', rating: 4.9, trips: 320, userEmail: 'driver1@test.local', nik: '1173011203850001', bank: 'BCA 8210099001 a.n. Bang Jamil' },
  { id: 'd_2', agencyId: 'ag_1', name: 'Teuku Rizal', phone: '0812000007', simType: 'A', simExp: 2027, simPhoto: '', ktpPhoto: '', photo: '', status: 'aktif', rating: 4.7, trips: 180, userEmail: 'driver2@test.local', nik: '1173021507900002', bank: 'BRI 0022010190002 a.n. Teuku Rizal' },
  { id: 'd_3', agencyId: 'ag_2', name: 'Bang Hendra', phone: '0812000004', simType: 'A', simExp: 2026, simPhoto: '', ktpPhoto: '', photo: '', status: 'aktif', rating: 4.8, trips: 210, userEmail: 'driver3@test.local', nik: '1171012204880004', bank: 'BCA 8210099004 a.n. Bang Hendra' },
  { id: 'd_new', agencyId: 'ag_2', name: 'Pengemudi Baru', phone: '0812000088', simType: 'B1', simExp: 2029, simPhoto: '', ktpPhoto: '', photo: '', status: 'aktif', rating: 5.0, trips: 0, userEmail: '', nik: '1171011208940012', bank: '' }
]);

seedCollection('schedules', [
  { id: 's_1', agencyId: 'ag_1', routeId: 'rt_1', vehicleId: 'v_1', driverId: 'd_1', driverName: 'Bang Jamil', backupDriverId: '', backupName: '', date: futureDate(1), time: '08:00', price: 150000, status: 'open', tripStatus: 'scheduled', blockedSeats: ['A2'], createdAt: '2026-10-20T00:00:00.000Z' },
  { id: 's_2', agencyId: 'ag_1', routeId: 'rt_1', vehicleId: 'v_2', driverId: 'd_2', driverName: 'Teuku Rizal', backupDriverId: 'd_1', backupName: 'Bang Jamil', date: futureDate(2), time: '14:00', price: 150000, status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: '2026-10-20T00:00:00.000Z' },
  { id: 's_3', agencyId: 'ag_2', routeId: 'rt_2', vehicleId: 'v_4', driverId: 'd_3', driverName: 'Bang Hendra', backupDriverId: '', backupName: '', date: futureDate(1), time: '09:00', price: 260000, status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: '2026-10-20T00:00:00.000Z' },
  { id: 's_pending', agencyId: 'ag_4', routeId: 'rt_2', vehicleId: 'v_pending', driverId: 'd_3', driverName: 'Bang Hendra', backupDriverId: '', backupName: '', date: futureDate(1), time: '11:00', price: 270000, status: 'open', tripStatus: 'scheduled', blockedSeats: [], createdAt: '2026-10-20T00:00:00.000Z' }
]);

seedCollection('bookings', [
  { id: 'b_1', code: 'TA-1', scheduleId: 's_1', userEmail: 'cust1@test.local', seats: ['A1'], status: 'paid', total: 150000, createdAt: '2026-10-20T01:00:00.000Z' },
  { id: 'b_2', code: 'TA-2', scheduleId: 's_1', userEmail: 'cust2@test.local', seats: ['A3'], status: 'pending', total: 150000, createdAt: '2026-10-20T02:00:00.000Z' },
  { id: 'b_3', code: 'TA-3', scheduleId: 's_2', userEmail: 'cust1@test.local', seats: ['B1'], status: 'done', total: 150000, createdAt: '2026-10-20T03:00:00.000Z' },
  { id: 'b_4', code: 'TA-4', scheduleId: 's_3', userEmail: 'cust2@test.local', seats: ['A4'], status: 'paid', total: 260000, createdAt: '2026-10-20T04:00:00.000Z' }
]);

seedCollection('payments', [
  { id: 'p_1', bookingId: 'b_1', amount: 150000, method: 'transfer', status: 'paid', fee: 12000, time: '2026-10-20T01:05:00.000Z' },
  { id: 'p_2', bookingId: 'b_2', amount: 150000, method: 'transfer', status: 'pending', fee: 12000, time: '2026-10-20T02:05:00.000Z' },
  { id: 'p_3', bookingId: 'b_3', amount: 150000, method: 'cash', status: 'paid', fee: 12000, time: '2026-10-20T03:05:00.000Z' },
  { id: 'p_4', bookingId: 'b_4', amount: 260000, method: 'transfer', status: 'paid', fee: 26000, time: '2026-10-20T04:05:00.000Z' }
]);

seedCollection('ledger', [
  {
    id: 'l_1', agencyId: 'ag_1', bookingId: 'b_1', scheduleId: 's_1', driverId: 'd_1',
    userEmail: 'cust1@test.local', seats: ['A1'],
    ticket: 12000, service: 3000, fee: 1000, total: 16000,
    status: 'layak', createdAt: '2026-10-20T01:05:00.000Z',
    releasedAt: null, paidOutAt: null
  },
  {
    id: 'l_2', agencyId: 'ag_2', bookingId: 'b_4', scheduleId: 's_3', driverId: 'd_3',
    userEmail: 'cust2@test.local', seats: ['A4'],
    ticket: 220000, service: 10000, fee: 26000, total: 260000,
    status: 'layak', createdAt: '2026-10-20T04:05:00.000Z',
    releasedAt: null, paidOutAt: null
  }
]);

seedCollection('notifications', [
  { id: 'n_1', to: 'cust1@test.local', title: 'Booking dibuat', msg: 'Pembayaran diterima', ch: 'app', time: '2026-10-20T01:06:00.000Z', read: false },
  { id: 'n_2', to: 'cust2@test.local', title: 'Booking dibuat', msg: 'Segera bayar', ch: 'app', time: '2026-10-20T02:06:00.000Z', read: false },
  { id: 'n_3', to: 'agen1@test.local', title: 'Pesanan baru', msg: 'Ada booking baru', ch: 'app', time: '2026-10-20T02:07:00.000Z', bookingId: 'b_1', kind: 'booking', read: false },
  { id: 'n_4', to: 'driver1@test.local', title: 'Tugas baru', msg: 'Anda ditugaskan', ch: 'app', time: '2026-10-20T02:08:00.000Z', read: false },
  { id: 'n_all', to: 'all', title: 'Pengumuman', msg: 'Promo akhir bulan', ch: 'app', time: '2026-10-20T02:09:00.000Z', read: false }
]);

seedCollection('supportTickets', [
  { id: 'st_1', code: 'ADU-1', userEmail: 'cust1@test.local', userId: 'u_cust_1', bookingCode: '', status: 'new', messages: [] },
  { id: 'st_2', code: 'ADU-2', agencyId: 'ag_1', userEmail: 'cust2@test.local', bookingCode: 'TA-1', status: 'process', messages: [{ id: 'MSG-2-1', from: 'user', text: 'Booking gagal tampil di tiket', author: 'Dedi', at: '2026-10-20T02:10:00.000Z' }], statusHistory: [{ status: 'process', at: '2026-10-20T02:12:00.000Z', by: 'agen1@test.local', note: 'Diproses agen' }] },
  { id: 'st_3', code: 'ADU-3', userEmail: 'cust2@test.local', bookingCode: 'TA-9', status: 'new', messages: [] },
  { id: 'st_4', code: 'ADU-4', agencyId: 'ag_2', userEmail: 'cust2@test.local', bookingCode: 'TA-4', status: 'new', messages: [] }
]);

seedCollection('audit', [
  { id: 'a_1', time: '2026-10-20T01:00:00.000Z', actor: 'cust1@test.local (pelanggan)', action: 'login', detail: '' },
  { id: 'a_2', time: '2026-10-20T02:00:00.000Z', actor: 'cust2@test.local (pelanggan)', action: 'login', detail: '' },
  { id: 'a_3', time: '2026-10-20T03:00:00.000Z', actor: 'agen1@test.local (agen)', action: 'login', detail: '' },
  { id: 'a_4', time: '2026-10-20T04:00:00.000Z', actor: 'system', action: 'seed', detail: '' }
]);

seedCollection('reviews', [
  { id: 'rv_1', agencyId: 'ag_1', user: 'Rina Amelia', rating: 5, text: 'Pengemudi ramah.', date: '2026-10-23', trip: 'Calang → Banda Aceh' },
  { id: 'rv_2', agencyId: 'ag_2', user: 'Dedi', rating: 4, text: 'Perjalanan lancar.', date: '2026-10-22', trip: 'Banda Aceh → Medan' },
  { id: 'rv_pending', agencyId: 'ag_4', user: 'Pending', rating: 5, text: 'Belum boleh tampil.', date: '2026-10-22', trip: '-' }
]);

seedCollection('banners', [
  { id: 'bnr_1', title: 'Diskon 20%', sub: 'Kode HEMAT20', active: true }
]);

seedCollection('vouchers', [
  { code: 'HEMAT20', type: 'percent', value: 20, maxDisc: 30000, quota: 100, used: 12, active: true, desc: 'Diskon 20%' }
]);

seedCollection('routeRequests', [
  { id: 'rr_1', agencyId: 'ag_1', routeId: 'rt_1', type: 'ubah-harga', status: 'pending' },
  { id: 'rr_2', agencyId: 'ag_2', routeId: 'rt_2', type: 'rute-baru', status: 'pending' }
]);

seedCollection('maintenanceRequests', [
  { id: 'm_1', agencyId: 'ag_1', driverId: 'd_1', vehicleId: 'v_1', status: 'menunggu', from: futureDate(3), until: futureDate(4) },
  { id: 'm_2', agencyId: 'ag_2', driverId: 'd_3', vehicleId: 'v_4', status: 'menunggu', from: futureDate(3), until: futureDate(4) }
]);

seedCollection('settings', [
  { key: 'platformFee', value: { type: 'percent', value: 8 } }
]);

seedCollection('fees', [
  { id: 'fee_1', defaultType: 'percent', defaultValue: 8 }
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + (extra != null ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

function trackResponse(obj) { responses.push(JSON.stringify(obj)); return obj; }

function dispatch(reqObj) {
  try {
    const result = S.apiDispatch_(reqObj);
    return trackResponse(result);
  } catch (err) {
    const out = {
      ok: false,
      error: { code: err.code || 'ERROR', message: err.message || String(err) }
    };
    return trackResponse(out);
  }
}

function bodyOf(reqBody, extra) {
  return Object.assign({ body: reqBody }, extra);
}

function metaValue(key) {
  const row = metaSheet.rows.find((r) => String(r[0]) === key);
  return row ? String(row[1]) : null;
}

function revOf(key) {
  return Number(metaValue('rev.' + key) || 0) || 0;
}

function login(email, password, extra) {
  return dispatch(bodyOf({ email, password }, Object.assign({ action: 'login' }, extra || {})));
}

function sync(changes, token) {
  return dispatch(bodyOf({ changes }, { action: 'sync', token }));
}

function idsOf(list) {
  return (list || []).map((x) => String(x && x.id)).sort();
}

function record(records, key, id) {
  return (records[key] || []).find((x) => String(x.id) === id);
}

function clearRateLimits() { cacheStore.clear(); }

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

console.log('\n== 1) setup, health, mode direct ==');
S.setupBackend();
const proxyKey = scriptProperties.get('API_PROXY_KEY');
ok('setupBackend menggenerasi API_PROXY_KEY', (proxyKey || '').length >= 40);
ok('setupBackend menggenerasi API_TOKEN_SECRET', (scriptProperties.get('API_TOKEN_SECRET') || '').length >= 40);
ok('setupBackend menggenerasi PASSWORD_PEPPER', (scriptProperties.get('PASSWORD_PEPPER') || '').length >= 40);
ok('setupBackend menggenerasi TOKEN_TTL', Number(scriptProperties.get('TOKEN_TTL')) > 0);
ok('REQUIRE_PROXY_KEY default false', scriptProperties.get('REQUIRE_PROXY_KEY') === 'false');

let res = dispatch({ action: 'health' });
ok('health tanpa proxyKey tetap ok', res.ok === true && res.data.version === '1.3.0', res);
ok('health tidak membocorkan secret', !JSON.stringify(res).includes(proxyKey) && !JSON.stringify(res).includes(scriptProperties.get('API_TOKEN_SECRET')));

/* ------------------------------------------------------------------ */
/* 2) login legacy & migrasi password                                  */
/* ------------------------------------------------------------------ */

console.log('\n== 2) login direct (tanpa proxyKey), migrasi plaintext -> hash ==');
const usersRevBeforeLogin = revOf('users');
res = login('admin@transaceh.id', LEGACY_ADMIN_PW);
ok('login legacy tanpa proxyKey sukses', res.ok === true && typeof res.data.token === 'string' && res.data.token.length > 20, res);
ok('response login tanpa field pass/hash', !('"pass"' in (res.data.user || {})) && !('passHash' in (res.data.user || {})), Object.keys(res.data.user || {}));
ok('login dengan hash modern tidak menulis ulang users', revOf('users') === usersRevBeforeLogin, { before: usersRevBeforeLogin, after: revOf('users') });
const adminRecAfter = readRec('users', 'u_admin_1');
ok('plaintext password tidak tersimpan sebagai field record', !!adminRecAfter && !Object.prototype.hasOwnProperty.call(adminRecAfter, 'pass'));
ok('passHash terisi setelah login', !!adminRecAfter && typeof adminRecAfter.passHash === 'string' && adminRecAfter.passHash.length > 20);
let adminToken = res.data.token;
let agenToken = '';
let driverToken = '';
let custToken = '';

res = login('agen1@test.local', LEGACY_AGEN_PW);
ok('login agen direct sukses', res.ok === true && res.data.user.role === 'agen', res);
agenToken = res.data.token;

res = login('driver1@test.local', LEGACY_DRIVER1_PW);
ok('login pengemudi direct sukses', res.ok === true && res.data.user.role === 'pengemudi', res);
driverToken = res.data.token;

res = login('cust1@test.local', LEGACY_CUST1_PW);
ok('login pelanggan direct sukses', res.ok === true && res.data.user.role === 'pelanggan', res);
custToken = res.data.token;

/* ------------------------------------------------------------------ */

console.log('\n== 3) login salah, session, token ==');
res = login('admin@transaceh.id', 'wrong-password-xyz');
ok('login password salah ditolak', res.ok === false && res.error.code === 'UNAUTHORIZED', res);
ok('message tidak menyebut field yang bocor', !JSON.stringify(res).includes('passHash'));

res = login('admin@transaceh.id', LEGACY_ADMIN_PW);
ok('login kedua (hash path) sukses', res.ok === true && res.data.token.length > 20, res);

res = dispatch(bodyOf({}, { action: 'session', token: adminToken }));
ok('session dengan token valid ok', res.ok === true && res.data.user.id === 'u_admin_1', res);

const tampered = adminToken.slice(0, -4) + 'AAAA';
res = dispatch(bodyOf({}, { action: 'session', token: tampered }));
ok('session dengan token rusak ditolak', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

const expiredToken = S.apiIssueToken_({ id: 'u_admin_1' }, { token: scriptProperties.get('API_TOKEN_SECRET'), ttl: -3600 });
res = dispatch(bodyOf({}, { action: 'session', token: expiredToken.token }));
ok('session dengan token expired ditolak', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

res = dispatch(bodyOf({}, { action: 'session', proxyKey: 'salah-proxy-key-999', token: adminToken }));
ok('mode direct: proxyKey salah tetap ditolak', res.ok === false && res.error.code === 'PROXY_FORBIDDEN', res);

scriptProperties.set('REQUIRE_PROXY_KEY', 'true');
res = dispatch(bodyOf({}, { action: 'session', token: adminToken }));
ok('proxy diwajibkan saat flag true: tanpa key ditolak', res.ok === false && res.error.code === 'PROXY_FORBIDDEN', res);
res = dispatch(bodyOf({}, { action: 'session', proxyKey, token: adminToken }));
ok('proxy diwajibkan saat flag true: key benar diterima', res.ok === true, res);
scriptProperties.set('REQUIRE_PROXY_KEY', 'false');

/* ------------------------------------------------------------------ */

console.log('\n== 4) bootstrap superadmin / publik serta proyeksi aman ==');
res = dispatch(bodyOf({}, { action: 'bootstrap', token: adminToken }));
ok('bootstrap superadmin mendapat semua koleksi', res.ok === true && Object.keys(res.data.records).length === seedKeys.length, Object.keys(res.data.records || {}));
ok('bootstrap superadmin menyertakan users & audit', Object.keys(res.data.records).includes('users') && Object.keys(res.data.records).includes('audit'));
ok('users pada bootstrap sudah disanitasi', !JSON.stringify(res.data.records.users).includes('"passHash"'));
ok('revisions bootstrap numerik dan sinkron', res.data.revisions.users === revOf('users') && res.data.revisions.routes === revOf('routes'), res.data.revisions);

const publicRes = dispatch(bodyOf({}, { action: 'bootstrap' }));
const publicRecords = publicRes.data ? publicRes.data.records : {};
const publicJson = JSON.stringify(publicRes);
ok('bootstrap publik sukses tanpa token', publicRes.ok === true && publicRes.data.role === 'publik', publicRes);
ok('bootstrap publik hanya koleksi publik', Object.keys(publicRecords).sort().join(',') === 'agencies,banners,reviews,routes,schedules,vehicles', Object.keys(publicRecords));
ok('bootstrap publik tanpa users/bookings/notifications',
  !Object.keys(publicRecords).includes('users') &&
  !Object.keys(publicRecords).includes('bookings') &&
  !Object.keys(publicRecords).includes('notifications'));
ok('proyeksi agensi tanpa kyc/bank/rekening',
  (publicRecords.agencies || []).every((a) => !Object.prototype.hasOwnProperty.call(a, 'kyc') && !Object.prototype.hasOwnProperty.call(a, 'bank') && !Object.prototype.hasOwnProperty.call(a, 'rekeningNo')),
  publicRecords.agencies);
ok('proyeksi kendaraan tanpa data pemilik/dokumen',
  (publicRecords.vehicles || []).every((v) => !Object.prototype.hasOwnProperty.call(v, 'ownerNik') && !Object.prototype.hasOwnProperty.call(v, 'stnkPhoto') && !Object.prototype.hasOwnProperty.call(v, 'chassis')));
ok('respons publik tidak memuat NIK/NPWP/rekening/nama pemilik',
  !publicJson.includes(kyc1.nik) &&
  !publicJson.includes(kyc1.npwp) &&
  !publicJson.includes(kyc1.rekeningNo) &&
  !publicJson.includes('fotoKtp') &&
  !publicJson.includes('MHFXW41G2N2001001'),
  publicJson.slice(0, 300));
ok('publik hanya melihat agensi aktif', (publicRecords.agencies || []).every((a) => a.status === 'active') && (publicRecords.agencies || []).length === 2, (publicRecords.agencies || []).map((a) => a.id));
ok('katalog publik mengecualikan armada/jadwal/ulasan agensi pending',
  !idsOf(publicRecords.vehicles).includes('v_pending') &&
  !idsOf(publicRecords.schedules).includes('s_pending') &&
  !idsOf(publicRecords.reviews).includes('rv_pending'),
  { vehicles: idsOf(publicRecords.vehicles), schedules: idsOf(publicRecords.schedules), reviews: idsOf(publicRecords.reviews) });
const pubS1 = record(publicRecords, 'schedules', 's_1');
ok('jadwal publik memuat takenSeats gabungan booking+blokir+nonaktif',
  !!pubS1 && pubS1.takenSeats.join(',') === 'A1,A2,A3,A5', pubS1 && pubS1.takenSeats);
ok('jadwal publik tidak membocorkan driverId/nama pengemudi',
  (publicRecords.schedules || []).every((s) => !Object.prototype.hasOwnProperty.call(s, 'driverId') && !Object.prototype.hasOwnProperty.call(s, 'driverName')));

/* ------------------------------------------------------------------ */
/* 5) bootstrap peran: filter baris                                    */
/* ------------------------------------------------------------------ */

console.log('\n== 5) filter baris per peran ==');
res = dispatch(bodyOf({}, { action: 'bootstrap', token: agenToken }));
const agenRecords = res.data ? res.data.records : {};
ok('bootstrap agen sukses', res.ok === true && res.data.role === 'agen', res);
ok('agen melihat agensinya penuh (kyc ada)', !!record(agenRecords, 'agencies', 'ag_1') && !!record(agenRecords, 'agencies', 'ag_1').kyc);
ok('agen tidak melihat kyc agensi lain', !!record(agenRecords, 'agencies', 'ag_2') && !record(agenRecords, 'agencies', 'ag_2').kyc);
ok('agen hanya melihat jadwal agensinya + jadwal publik',
  idsOf(agenRecords.schedules).join(',') === 's_1,s_2,s_3' &&
  !!record(agenRecords, 'schedules', 's_1').driverId &&
  !Object.prototype.hasOwnProperty.call(record(agenRecords, 'schedules', 's_3'), 'driverId'),
  agenRecords.schedules);
ok('agen melihat armada sendiri penuh, armada lain terproyeksi',
  (agenRecords.vehicles || []).find((v) => v.id === 'v_1').ownerNik === kyc1.nik &&
  !Object.prototype.hasOwnProperty.call((agenRecords.vehicles || []).find((v) => v.id === 'v_4'), 'ownerNik'));
ok('agen tidak melihat armada/jadwal agensi pending', !idsOf(agenRecords.vehicles).includes('v_pending') && !idsOf(agenRecords.schedules).includes('s_pending'));
ok('agen melihat ulasan publik yang sah', idsOf(agenRecords.reviews).join(',') === 'rv_1,rv_2', idsOf(agenRecords.reviews));
ok('agen hanya melihat booking jadwalnya', idsOf(agenRecords.bookings).join(',') === 'b_1,b_2,b_3', idsOf(agenRecords.bookings));
ok('agen hanya melihat payment booking-nya', idsOf(agenRecords.payments).join(',') === 'p_1,p_2,p_3', idsOf(agenRecords.payments));
ok('agen hanya melihat ledger agensinya', idsOf(agenRecords.ledger).join(',') === 'l_1', idsOf(agenRecords.ledger));
ok('agen hanya melihat route request agensinya', idsOf(agenRecords.routeRequests).join(',') === 'rr_1', idsOf(agenRecords.routeRequests));
ok('agen hanya melihat maintenance agensinya', idsOf(agenRecords.maintenanceRequests).join(',') === 'm_1', idsOf(agenRecords.maintenanceRequests));
ok('agen hanya melihat tiket terkait agensinya', idsOf(agenRecords.supportTickets).join(',') === 'st_2', idsOf(agenRecords.supportTickets));
ok('agen hanya melihat notifikasi miliknya', idsOf(agenRecords.notifications).join(',') === 'n_3,n_all', idsOf(agenRecords.notifications));
ok('agen hanya melihat user agensinya', idsOf(agenRecords.users).join(',') === 'u_agen_1,u_driver_1', idsOf(agenRecords.users));
ok('agen hanya melihat audit miliknya', idsOf(agenRecords.audit).join(',') === 'a_3', idsOf(agenRecords.audit));

res = dispatch(bodyOf({}, { action: 'bootstrap', token: driverToken }));
const driverRecords = res.data ? res.data.records : {};
ok('bootstrap pengemudi sukses', res.ok === true && res.data.role === 'pengemudi', res);
ok('pengemudi hanya melihat data driver-nya + rekan untuk manifest', idsOf(driverRecords.drivers).join(',') === 'd_1,d_2', idsOf(driverRecords.drivers));
ok('data rekan pengemudi tidak memuat NIK/bank/SIM', (() => {
  const mate = (driverRecords.drivers || []).find((d) => d.id === 'd_2');
  return !!mate && !Object.prototype.hasOwnProperty.call(mate, 'nik') &&
    !Object.prototype.hasOwnProperty.call(mate, 'bank') &&
    !Object.prototype.hasOwnProperty.call(mate, 'simPhoto');
})());
ok('pengemudi hanya melihat jadwal yang ditugaskan', idsOf(driverRecords.schedules).join(',') === 's_1,s_2', idsOf(driverRecords.schedules));
ok('pengemudi melihat booking jadwalnya saja', idsOf(driverRecords.bookings).join(',') === 'b_1,b_2,b_3', idsOf(driverRecords.bookings));
ok('pengemudi melihat kendaraan jadwalnya saja', idsOf(driverRecords.vehicles).join(',') === 'v_1,v_2', idsOf(driverRecords.vehicles));
ok('pengemudi melihat maintenance dirinya', idsOf(driverRecords.maintenanceRequests).join(',') === 'm_1', idsOf(driverRecords.maintenanceRequests));
ok('pengemudi melihat notifikasi miliknya', idsOf(driverRecords.notifications).join(',') === 'n_4,n_all', idsOf(driverRecords.notifications));
ok('pengemudi melihat user dirinya + agen induk', idsOf(driverRecords.users).join(',') === 'u_agen_1,u_driver_1', idsOf(driverRecords.users));
ok('pengemudi tidak menerima ulasan agensi pending', !idsOf(driverRecords.reviews).includes('rv_pending'));
ok('pengemudi tidak menerima kyc agensi', !JSON.stringify(driverRecords.agencies || []).includes('"kyc"'));

res = dispatch(bodyOf({}, { action: 'bootstrap', token: custToken }));
const custRecords = res.data ? res.data.records : {};
ok('bootstrap pelanggan sukses', res.ok === true && res.data.role === 'pelanggan', res);
ok('pelanggan hanya melihat booking miliknya', idsOf(custRecords.bookings).join(',') === 'b_1,b_3', idsOf(custRecords.bookings));
ok('pelanggan hanya melihat payment miliknya', idsOf(custRecords.payments).join(',') === 'p_1,p_3', idsOf(custRecords.payments));
ok('pelanggan hanya melihat notifikasi miliknya', idsOf(custRecords.notifications).join(',') === 'n_1,n_all', idsOf(custRecords.notifications));
ok('pelanggan hanya melihat tiket miliknya', idsOf(custRecords.supportTickets).join(',') === 'st_1', idsOf(custRecords.supportTickets));
ok('pelanggan hanya melihat user dirinya', idsOf(custRecords.users).join(',') === 'u_cust_1', idsOf(custRecords.users));
ok('pelanggan hanya melihat audit miliknya', idsOf(custRecords.audit).join(',') === 'a_1', idsOf(custRecords.audit));
ok('pelanggan menerima voucher untuk checkout', (custRecords.vouchers || []).some((v) => v.code === 'HEMAT20'));
ok('pelanggan tidak melihat katalog agensi pending', !idsOf(custRecords.vehicles).includes('v_pending') && !idsOf(custRecords.schedules).includes('s_pending') && !idsOf(custRecords.reviews).includes('rv_pending'));
ok('pelanggan tidak menerima data agensi sensitif', !JSON.stringify(custRecords.agencies || []).includes('"kyc"'));
ok('pelanggan melihat takenSeats jadwal', !!record(custRecords, 'schedules', 's_1') && record(custRecords, 'schedules', 's_1').takenSeats.join(',') === 'A1,A2,A3,A5');
ok('pelanggan melihat pengemudi pada jadwal booking sendiri',
  record(custRecords, 'schedules', 's_1')?.driverId === 'd_1' &&
  record(custRecords, 'schedules', 's_2')?.driverId === 'd_2' &&
  !Object.prototype.hasOwnProperty.call(record(custRecords, 'schedules', 's_3') || {}, 'driverId'),
  (custRecords.schedules || []).map((s) => ({ id: s.id, driverId: s.driverId })));
ok('pelanggan hanya menerima data pengemudi jadwalnya tanpa NIK/bank',
  idsOf(custRecords.drivers).join(',') === 'd_1,d_2' &&
  (custRecords.drivers || []).every((d) => !Object.prototype.hasOwnProperty.call(d, 'nik') && !Object.prototype.hasOwnProperty.call(d, 'bank')),
  custRecords.drivers);
ok('armada yang diterima pengemudi tidak memuat data pemilik/dokumen',
  (driverRecords.vehicles || []).every((v) => !Object.prototype.hasOwnProperty.call(v, 'ownerNik') &&
    !Object.prototype.hasOwnProperty.call(v, 'stnkPhoto') &&
    !Object.prototype.hasOwnProperty.call(v, 'chassis')), driverRecords.vehicles);

/* ------------------------------------------------------------------ */
/* 6) commit (hanya superadmin)                                        */
/* ------------------------------------------------------------------ */

console.log('\n== 6) commit upsert / delete / konflik revisi / role ==');
const routeBook = { id: 'r_1', from: 'Banda Aceh', to: 'Takengon' };
const routeBase = revOf('routes');
const upsert = { changes: { routes: { baseRev: routeBase, upserts: [routeBook], deletes: [] } } };
res = dispatch(bodyOf(upsert, { action: 'commit', token: adminToken }));
ok('commit superadmin upsert route baru sukses', res.ok === true && res.data.revisions.routes === routeBase + 1, res);
ok('sheet routes memuat route baru', spread.getSheetByName('routes').rows.some((r) => String(r[0]).trim() === 'r_1'));

res = dispatch(bodyOf(upsert, { action: 'commit', token: adminToken }));
ok('commit dengan revisi basi ditolak', res.ok === false && res.error.code === 'REV_CONFLICT', res);

res = dispatch(bodyOf(upsert, { action: 'commit', token: agenToken }));
ok('commit oleh agen ditolak (FORBIDDEN)', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = dispatch(bodyOf({ changes: { buku: { baseRev: 1, upserts: [], deletes: [] } } }, { action: 'commit', token: adminToken }));
ok('commit koleksi tidak dikenal ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ changes: {} }, { action: 'commit', token: adminToken }));
ok('commit changes kosong ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

const emptyTargetBase = { routes: revOf('routes'), banners: revOf('banners') };
res = dispatch(bodyOf({
  changes: {
    routes: { baseRev: emptyTargetBase.routes, upserts: [{ id: 'rt_noop', from: 'X', to: 'Y' }], deletes: [] },
    banners: { baseRev: emptyTargetBase.banners, upserts: [], deletes: [] }
  }
}, { action: 'commit', token: adminToken }));
ok('commit menolak koleksi tanpa perubahan sebelum menulis', res.ok === false && res.error.code === 'VALIDATION', res);
ok('koleksi pertama tidak tertulis saat validasi batch gagal', !spread.getSheetByName('routes').rows.some((r) => String(r[0]).trim() === 'rt_noop'));

const routeRevNow = revOf('routes');
res = dispatch(bodyOf({ changes: { routes: { baseRev: routeRevNow, upserts: [{ name: 'tanpa-id' }], deletes: [] } } }, { action: 'commit', token: adminToken }));
ok('commit record tanpa id ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ changes: { routes: { baseRev: routeRevNow, upserts: [{ id: 'r_dup', from: 'a', to: 'b' }, { id: 'r_dup', from: 'a', to: 'b' }], deletes: [] } } }, { action: 'commit', token: adminToken }));
ok('commit id duplikat pada request ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ changes: { routes: { baseRev: routeRevNow, upserts: [{ id: 'r_secret', pass: 'guna' }], deletes: [] } } }, { action: 'commit', token: adminToken }));
ok('commit record berisi field rahasia ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

const delRes = dispatch(bodyOf({ changes: { routes: { baseRev: routeRevNow, upserts: [], deletes: ['r_1'] } } }, { action: 'commit', token: adminToken }));
ok('commit delete route sukses', delRes.ok === true && delRes.data.revisions.routes === routeRevNow + 1, delRes);
ok('sheet routes tidak lagi memuat r_1', !spread.getSheetByName('routes').rows.some((r) => String(r[0]).trim() === 'r_1'));

const selfDelRes = dispatch(bodyOf({ changes: { users: { baseRev: revOf('users'), upserts: [], deletes: ['u_admin_1'] } } }, { action: 'commit', token: adminToken }));
ok('commit menolak superadmin menghapus akun sendiri', selfDelRes.ok === false && selfDelRes.error.code === 'VALIDATION', selfDelRes);

const multiBase = { routes: revOf('routes'), banners: revOf('banners') };
const multiRes = dispatch(bodyOf({
  changes: {
    routes: { baseRev: multiBase.routes, upserts: [{ id: 'rt_3', from: 'Calang', to: 'Meulaboh' }], deletes: [] },
    banners: { baseRev: multiBase.banners, upserts: [{ id: 'bnr_2', title: 'Promo Baru', active: true }], deletes: [] }
  }
}, { action: 'commit', token: adminToken }));
ok('commit multi-koleksi menaikkan kedua revisi',
  multiRes.ok === true &&
  multiRes.data.revisions.routes === multiBase.routes + 1 &&
  multiRes.data.revisions.banners === multiBase.banners + 1, multiRes);

const usersBase = revOf('users');
const profileUpdate = { id: 'u_cust_1', name: 'Rina Amelia Updated', email: 'cust1@test.local', phone: '0812000005', role: 'pelanggan', status: 'active', favorites: [] };
res = dispatch(bodyOf({ changes: { users: { baseRev: usersBase, upserts: [profileUpdate], deletes: [] } } }, { action: 'commit', token: adminToken }));
ok('commit profil user (tanpa field password) sukses', res.ok === true && res.data.revisions.users === usersBase + 1, res);
res = login('cust1@test.local', LEGACY_CUST1_PW);
ok('commit profil user tidak menghapus hash password', res.ok === true, res);
const cust1RecAfter = readRec('users', 'u_cust_1');
ok('hash password user tetap ada setelah commit profil', !!cust1RecAfter && typeof cust1RecAfter.passHash === 'string' && cust1RecAfter.name === 'Rina Amelia Updated');

/* ------------------------------------------------------------------ */
/* 7) changePassword                                                   */
/* ------------------------------------------------------------------ */

console.log('\n== 7) change password ==');
const oldAdminToken = adminToken;
res = dispatch(bodyOf({ currentPassword: LEGACY_ADMIN_PW, newPassword: NEW_ADMIN_PW }, { action: 'changePassword', token: adminToken }));
ok('ganti password sukses', res.ok === true && res.data.user.id === 'u_admin_1', res);

res = dispatch(bodyOf({}, { action: 'session', token: oldAdminToken }));
ok('token lama dicabut setelah ganti password', res.ok === false && res.error.code === 'UNAUTHORIZED', res);
res = dispatch(bodyOf({ currentPassword: NEW_ADMIN_PW, newPassword: 'old-token-pw-123' }, { action: 'changePassword', token: oldAdminToken }));
ok('token lama juga tidak boleh mengganti password', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

res = login('admin@transaceh.id', NEW_ADMIN_PW);
ok('login dengan password baru sukses', res.ok === true, res);
adminToken = res.data.token;
res = login('admin@transaceh.id', LEGACY_ADMIN_PW);
ok('login dengan password lama ditolak', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

res = dispatch(bodyOf({ currentPassword: 'wrong-current', newPassword: 'another-pw-again' }, { action: 'changePassword', token: adminToken }));
ok('ganti password dengan password lama salah ditolak', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

res = dispatch(bodyOf({ currentPassword: NEW_ADMIN_PW, newPassword: NEW_ADMIN_PW }, { action: 'changePassword', token: adminToken }));
ok('ganti password dengan nilai sama ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ currentPassword: NEW_ADMIN_PW, newPassword: 'pendek' }, { action: 'changePassword', token: adminToken }));
ok('password baru terlalu pendek ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

/* ------------------------------------------------------------------ */
/* 8) register                                                         */
/* ------------------------------------------------------------------ */

console.log('\n== 8) register pelanggan / agen ==');
res = dispatch(bodyOf({ name: 'Pelanggan Baru', email: 'newcust@test.local', phone: '081255550001', password: REG_PAX_PW, role: 'pelanggan' }, { action: 'register' }));
ok('register pelanggan sukses + token', res.ok === true && res.data.user.role === 'pelanggan' && typeof res.data.token === 'string' && res.data.pending === false, res);
const newCustId = res.ok ? res.data.user.id : '';
ok('register pelanggan menyimpan hash, bukan plaintext', (() => {
  const recMan = readRec('users', newCustId);
  return !!recMan && typeof recMan.passHash === 'string' && !JSON.stringify(recMan).includes(REG_PAX_PW);
})());

res = dispatch(bodyOf({ name: 'Duplikat', email: 'newcust@test.local', phone: '081255550002', password: 'duplikat-pw-123', role: 'pelanggan' }, { action: 'register' }));
ok('register email duplikat ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Pendek', email: 'short@test.local', phone: '081255550003', password: 'pendek', role: 'pelanggan' }, { action: 'register' }));
ok('register password < 8 ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'HP Salah', email: 'badphone@test.local', phone: '123', password: 'badphone-pw-123', role: 'pelanggan' }, { action: 'register' }));
ok('register no HP tidak valid ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Agen Baru', email: 'newagen@test.local', phone: '081255550004', password: REG_AGEN_PW, role: 'agen', agencyName: 'Travel Harapan', agencyAddress: 'Jl. Harapan No.2' }, { action: 'register' }));
ok('register agen sukses dan pending tanpa token', res.ok === true && res.data.pending === true && res.data.user.status === 'pending' && !res.data.token, res);
const newAgencyId = res.ok ? res.data.user.agencyId : '';
ok('register agen membuat agensi pending', (() => {
  const recMan = readRec('agencies', newAgencyId);
  return !!recMan && recMan.status === 'pending';
})());
res = login('newagen@test.local', REG_AGEN_PW);
ok('login agen pending sukses untuk melengkapi KYC', res.ok === true && res.data.user.status === 'pending' && typeof res.data.token === 'string', res);
const pendingAgenToken = res.ok ? res.data.token : '';
const pendingAgenUserId = res.ok ? res.data.user.id : '';
res = dispatch(bodyOf({}, { action: 'bootstrap', token: pendingAgenToken }));
ok('bootstrap agen pending hanya memuat agensi sendiri dan akun sendiri',
  res.ok === true &&
  (res.data.records.agencies || []).length === 1 &&
  String(res.data.records.agencies[0].id) === String(newAgencyId) &&
  (res.data.records.users || []).length === 1 &&
  !res.data.records.schedules && !res.data.records.vehicles, res);
const pendingAgencyRec = readRec('agencies', newAgencyId);
const pendingAgencyBase = revOf('agencies');
res = sync({ agencies: { baseRev: pendingAgencyBase, upserts: [Object.assign({}, pendingAgencyRec, { kyc: { nama: 'Agen Baru KYC' } })], deletes: [] } }, pendingAgenToken);
ok('agen pending boleh menyimpan KYC agensinya', res.ok === true && res.data.revisions.agencies === pendingAgencyBase + 1, res);
res = sync({ vehicles: { baseRev: revOf('vehicles'), upserts: [{ id: 'v_ilegal', agencyId: newAgencyId, plate: 'BL 1 X' }], deletes: [] } }, pendingAgenToken);
ok('agen pending tetap dilarang menulis armada', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ users: { baseRev: revOf('users'), upserts: [], deletes: [pendingAgenUserId] } }, pendingAgenToken);
ok('agen pending tidak boleh menghapus akun', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = dispatch(bodyOf({ name: 'Super', email: 'superbaru@test.local', phone: '081255550005', password: 'superbaru-pw-123', role: 'superadmin' }, { action: 'register' }));
ok('register role superadmin ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

/* ------------------------------------------------------------------ */
/* 9) adminCreateUser / adminSetPassword                               */
/* ------------------------------------------------------------------ */

console.log('\n== 9) aksi admin ==');
res = dispatch(bodyOf({ name: 'Agen Baru', email: 'agenbaru@test.local', phone: '081255560001', password: AGEN_NEW_PW, role: 'agen', agencyId: 'ag_new', status: 'active' }, { action: 'adminCreateUser', token: adminToken }));
ok('admin membuat akun agen (status ikut agensi pending)', res.ok === true && res.data.user.role === 'agen' && res.data.user.status === 'pending' && res.data.user.agencyId === 'ag_new', res);

res = login('agenbaru@test.local', AGEN_NEW_PW);
ok('akun agen pending bisa login untuk KYC', res.ok === true && res.data.user.status === 'pending' && typeof res.data.token === 'string', res);

res = dispatch(bodyOf({ name: 'Agen Kedua', email: 'agenkedua@test.local', phone: '081255560002', password: 'agenkedua-pw-123', role: 'agen', agencyId: 'ag_new', status: 'active' }, { action: 'adminCreateUser', token: adminToken }));
ok('satu agensi hanya boleh satu akun agen', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Agen Barakah 2', email: 'agenbarakah2@test.local', phone: '081255560003', password: 'agenbarakah2-pw-123', role: 'agen', agencyId: 'ag_1', status: 'active' }, { action: 'adminCreateUser', token: adminToken }));
ok('agensi yang sudah punya agen ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Pengemudi Baru', email: 'driver.baru@test.local', phone: '081255560004', password: DRIVER_NEW_PW, role: 'pengemudi', driverId: 'd_new', status: 'active' }, { action: 'adminCreateUser', token: adminToken }));
ok('admin membuat akun pengemudi', res.ok === true && res.data.user.role === 'pengemudi' && res.data.user.agencyId === 'ag_2', res);
const newDriverId = res.ok ? res.data.user.id : '';
const dNewRec = readRec('drivers', 'd_new');
ok('akun pengemudi menautkan email ke data driver', !!dNewRec && dNewRec.userEmail === 'driver.baru@test.local');
res = login('driver.baru@test.local', DRIVER_NEW_PW);
ok('pengemudi baru bisa login', res.ok === true && res.data.user.id === newDriverId, res);

res = dispatch(bodyOf({ name: 'Mismatch', email: 'mismatch@test.local', phone: '081255560005', password: 'mismatch-pw-123', role: 'pengemudi', driverId: 'd_1', status: 'active' }, { action: 'adminCreateUser', token: adminToken }));
ok('email pengemudi harus sama dengan data driver', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Admin Palsu', email: 'adminpalsu@test.local', phone: '081255560006', password: 'adminpalsu-pw-123', role: 'superadmin' }, { action: 'adminCreateUser', token: adminToken }));
ok('adminCreateUser menolak role superadmin', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Duplikat Admin', email: 'admin@transaceh.id', phone: '081255560007', password: 'duplikatadmin-pw-123', role: 'pelanggan' }, { action: 'adminCreateUser', token: adminToken }));
ok('adminCreateUser menolak email duplikat', res.ok === false && res.error.code === 'VALIDATION', res);

res = dispatch(bodyOf({ name: 'Ilegal', email: 'ilegal@test.local', phone: '081255560008', password: 'ilegal-pw-123', role: 'agen', agencyId: 'ag_new' }, { action: 'adminCreateUser', token: agenToken }));
ok('adminCreateUser oleh agen ditolak', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = login('cust2@test.local', LEGACY_CUST2_PW);
ok('login cust2 sebelum reset sukses', res.ok === true, res);
const oldCust2Token = res.ok ? res.data.token : '';

res = dispatch(bodyOf({ userId: 'u_cust_2', newPassword: NEW_CUST2_PW }, { action: 'adminSetPassword', token: adminToken }));
ok('adminSetPassword sukses', res.ok === true && res.data.user.id === 'u_cust_2', res);
res = dispatch(bodyOf({}, { action: 'session', token: oldCust2Token }));
ok('token lama dicabut setelah admin reset password', res.ok === false && res.error.code === 'UNAUTHORIZED', res);
res = login('cust2@test.local', NEW_CUST2_PW);
ok('akun reset bisa login dengan password baru', res.ok === true, res);
res = login('cust2@test.local', LEGACY_CUST2_PW);
ok('password lama akun reset tidak berlaku', res.ok === false && res.error.code === 'UNAUTHORIZED', res);

res = dispatch(bodyOf({ userId: 'u_cust_2', newPassword: 'pendek' }, { action: 'adminSetPassword', token: adminToken }));
ok('adminSetPassword menolak password pendek', res.ok === false && res.error.code === 'VALIDATION', res);
res = dispatch(bodyOf({ userId: 'u_tidak_ada', newPassword: 'tidakada-pw-123' }, { action: 'adminSetPassword', token: adminToken }));
ok('adminSetPassword user tidak ada -> NOT_FOUND', res.ok === false && res.error.code === 'NOT_FOUND', res);
res = dispatch(bodyOf({ userId: 'u_cust_2', newPassword: 'olehagen-pw-123' }, { action: 'adminSetPassword', token: agenToken }));
ok('adminSetPassword oleh agen ditolak', res.ok === false && res.error.code === 'FORBIDDEN', res);

/* ------------------------------------------------------------------ */
/* 9b) sync ter-scope per peran                                        */
/* ------------------------------------------------------------------ */

console.log('\n== 9b) sync ter-scope, kepemilikan, kursi, revisi ==');
res = sync({}, custToken);
ok('sync changes kosong ditolak', res.ok === false && res.error.code === 'VALIDATION', res);

const custBase = revOf('users');
const custProfile = {
  id: 'u_cust_1', name: 'Rina Sync', email: 'cust1@test.local',
  phone: '0812000005', role: 'pelanggan', status: 'active', favorites: []
};
res = sync({ users: { baseRev: custBase, upserts: [custProfile], deletes: [] } }, custToken);
ok('sync pelanggan update profil sendiri sukses', res.ok === true && res.data.revisions.users === custBase + 1, res);
const custRecSync = readRec('users', 'u_cust_1');
ok('sync profil pelanggan tidak menghapus hash password', !!custRecSync && !!custRecSync.passHash && custRecSync.name === 'Rina Sync');

res = sync({ users: { baseRev: revOf('users'), upserts: [{
  id: 'u_cust_2', name: 'Hack', email: 'cust2@test.local',
  phone: '0812000006', role: 'pelanggan', status: 'active', favorites: []
}], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh mengubah akun lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ users: { baseRev: revOf('users'), upserts: [Object.assign({}, custProfile, { passwordHash: 'x' })], deletes: [] } }, custToken);
ok('sync menolak field rahasia dari klien', res.ok === false && res.error.code === 'VALIDATION', res);

const bookingBase = revOf('bookings');
const syncBooking = {
  id: 'b_sync_1', code: 'TA-S1', scheduleId: 's_1', userEmail: 'cust1@test.local',
  seats: ['A4'], passengers: [{ name: 'Uji Sync', seat: 'A4' }],
  subtotal: 150000, discount: 0, total: 150000, status: 'pending',
  holdExpiry: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-24T05:00:00.000Z'
};
res = sync({ bookings: { baseRev: bookingBase, upserts: [syncBooking], deletes: [] } }, custToken);
ok('sync pelanggan membuat booking di kursi kosong sukses', res.ok === true && res.data.revisions.bookings === bookingBase + 1, res);
const holdRec = readRec('bookings', 'b_sync_1');
const holdMs = holdRec ? Date.parse(holdRec.holdExpiry) : NaN;
ok('server menimpa holdExpiry booking baru menjadi 15 menit',
  Number.isFinite(holdMs) && holdMs > Date.now() && holdMs <= Date.now() + 20 * 60 * 1000, holdRec);

res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, {
  id: 'b_sync_maint_inject', code: 'TA-MI', seats: ['A6'],
  passengers: [{ name: 'Inject', seat: 'A6' }],
  maintenanceState: 'choice_pending', refundPct: 100
})], deletes: [] } }, custToken);
ok('sync menolak booking baru menyelipkan field maintenance/refund',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, {
  id: 'b_sync_2', code: 'TA-S2', seats: ['A1'],
  passengers: [{ name: 'Uji Sync', seat: 'A1' }]
})], deletes: [] } }, custToken);
ok('sync menolak kursi yang sudah dipakai booking lain', res.ok === false && res.error.code === 'SEAT_CONFLICT', res);

res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, { id: 'b_sync_3', code: 'TA-S3', userEmail: 'cust2@test.local' })], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh membuat booking atas nama orang lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ bookings: { baseRev: bookingBase, upserts: [syncBooking], deletes: [] } }, custToken);
ok('sync dengan revisi basi ditolak', res.ok === false && res.error.code === 'REV_CONFLICT', res);

const bOwn = readRec('bookings', 'b_sync_1');
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, {
  id: 'b_sync_fake_total', code: 'TA-FT', seats: ['A6'],
  passengers: [{ name: 'Fake', seat: 'A6' }], total: 1
})], deletes: [] } }, custToken);
ok('sync menolak total booking yang tidak sesuai harga', res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, {
  id: 'b_sync_fake_voucher', code: 'TA-FV', seats: ['A6'],
  passengers: [{ name: 'Fake', seat: 'A6' }], voucher: 'HEMAT20',
  discount: 0, total: 150000
})], deletes: [] } }, custToken);
ok('sync menolak diskon voucher yang tidak sesuai', res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bOwn, {
  total: 1
})], deletes: [] } }, custToken);
ok('sync menolak perubahan total booking', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bOwn, {
  status: 'done'
})], deletes: [] } }, custToken);
ok('sync menolak transisi status booking tidak sah', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bOwn, {
  holdExpiry: '2099-01-01T00:00:00.000Z'
})], deletes: [] } }, custToken);
ok('sync menolak memperpanjang hold booking', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bOwn, {
  holdExpiry: null
})], deletes: [] } }, custToken);
ok('sync menolak menghapus hold booking pending', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bOwn, {
  scheduleId: 's_2', seats: ['A6'], passengers: [{ name: 'Pindah', seat: 'A6' }]
})], deletes: [] } }, custToken);
ok('sync menolak pindah jadwal tanpa maintenance', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [], deletes: ['b_sync_1'] } }, custToken);
ok('sync menolak hapus booking oleh pelanggan', res.ok === false && res.error.code === 'FORBIDDEN', res);

const voucherRec = readRec('vouchers', 'HEMAT20');
const voucherBase = revOf('vouchers');
res = sync({ vouchers: { baseRev: voucherBase, upserts: [Object.assign({}, voucherRec, { used: Number(voucherRec.used || 0) + 1 })], deletes: [] } }, custToken);
ok('sync pelanggan boleh menaikkan pemakaian voucher satu langkah', res.ok === true && res.data.revisions.vouchers === voucherBase + 1, res);
res = sync({ vouchers: { baseRev: revOf('vouchers'), upserts: [Object.assign({}, voucherRec, { used: Number(voucherRec.used || 0) })], deletes: [] } }, custToken);
ok('sync menolak pengurangan pemakaian voucher tanpa pembatalan booking',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ vouchers: { baseRev: revOf('vouchers'), upserts: [Object.assign({}, voucherRec, { active: false })], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh mengubah field voucher lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const voucherBooking = Object.assign({}, syncBooking, {
  id: 'b_voucher_restore', code: 'TA-VR', seats: ['A6'],
  passengers: [{ name: 'Voucher', seat: 'A6' }],
  voucher: 'HEMAT20', discount: 30000, total: 120000
});
res = sync({
  bookings: { baseRev: revOf('bookings'), upserts: [voucherBooking], deletes: [] },
  vouchers: { baseRev: revOf('vouchers'), upserts: [Object.assign({}, voucherRec, {
    used: Number(voucherRec.used || 0) + 2
  })], deletes: [] }
}, custToken);
ok('sync pelanggan boleh membuat booking voucher + menaikkan pemakaian', res.ok === true, res);
const bVoucherRec = readRec('bookings', 'b_voucher_restore');
res = sync({
  bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bVoucherRec, {
    status: 'cancelled', cancelledAt: '2026-10-24T06:00:00.000Z',
    cancelledBy: 'cust1@test.local', cancelReason: 'Uji restorasi voucher'
  })], deletes: [] },
  vouchers: { baseRev: revOf('vouchers'), upserts: [Object.assign({}, voucherRec, {
    used: Number(voucherRec.used || 0) + 1
  })], deletes: [] }
}, custToken);
ok('sync pelanggan boleh mengembalikan voucher saat membatalkan booking',
  res.ok === true, res);

const ag1Rec = readRec('agencies', 'ag_1');
const agBase = revOf('agencies');
res = sync({ agencies: { baseRev: agBase, upserts: [Object.assign({}, ag1Rec, { phone: '0654-99999' })], deletes: [] } }, agenToken);
ok('sync agen update agensi sendiri sukses', res.ok === true && res.data.revisions.agencies === agBase + 1, res);
const ag2Rec = readRec('agencies', 'ag_2');
res = sync({ agencies: { baseRev: revOf('agencies'), upserts: [Object.assign({}, ag2Rec, { phone: '0651-00001' })], deletes: [] } }, agenToken);
ok('sync agen tidak boleh mengubah agensi lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const vehicleBase = revOf('vehicles');
res = sync({ vehicles: { baseRev: vehicleBase, upserts: [{
  id: 'v_sync_1', agencyId: 'ag_1', plate: 'BL 7777 SY', brand: 'Uji', model: 'Sync',
  status: 'aktif', capacity: 6, inactiveSeats: []
}], deletes: [] } }, agenToken);
ok('sync agen membuat armada sendiri sukses', res.ok === true && res.data.revisions.vehicles === vehicleBase + 1, res);

const s1Rec = readRec('schedules', 's_1');
const schedBase = revOf('schedules');
res = sync({ schedules: { baseRev: schedBase, upserts: [Object.assign({}, s1Rec, { price: 155000 })], deletes: [] } }, agenToken);
ok('sync agen update jadwal sendiri sukses', res.ok === true && res.data.revisions.schedules === schedBase + 1, res);

const s1Now = readRec('schedules', 's_1');
const driverSchedBase = revOf('schedules');
res = sync({ schedules: { baseRev: driverSchedBase, upserts: [Object.assign({}, s1Now, {
  tripStatus: 'ontrip', status: 'closed', departedAt: '2026-10-24T05:10:00.000Z'
})], deletes: [] } }, driverToken);
ok('sync pengemudi update status jadwal yang ditugaskan sukses', res.ok === true && res.data.revisions.schedules === driverSchedBase + 1, res);

const s3Rec = readRec('schedules', 's_3');
res = sync({ schedules: { baseRev: revOf('schedules'), upserts: [Object.assign({}, s3Rec, { tripStatus: 'ontrip' })], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh mengubah jadwal agensi lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ routes: { baseRev: revOf('routes'), upserts: [{ id: 'r_ilegal', from: 'X', to: 'Y' }], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh menulis rute', res.ok === false && res.error.code === 'FORBIDDEN', res);

const adminRouteBase = revOf('routes');
res = sync({ routes: { baseRev: adminRouteBase, upserts: [{ id: 'r_sync_admin', from: 'A', to: 'B' }], deletes: [] } }, adminToken);
ok('sync superadmin boleh menulis rute', res.ok === true && res.data.revisions.routes === adminRouteBase + 1, res);

const rt1Rec = readRec('routes', 'rt_1');
const agenRouteBase = revOf('routes');
res = sync({ routes: { baseRev: agenRouteBase, upserts: [Object.assign({}, rt1Rec, {
  driverIds: ['d_1'], driverId: 'd_1'
})], deletes: [] } }, agenToken);
ok('sync agen boleh menugaskan pengemudi sendiri pada rute agensinya', res.ok === true && res.data.revisions.routes === agenRouteBase + 1, res);
res = sync({ routes: { baseRev: revOf('routes'), upserts: [Object.assign({}, rt1Rec, {
  driverIds: ['d_1', 'd_3'], driverId: 'd_1'
})], deletes: [] } }, agenToken);
ok('sync agen tidak boleh menambahkan pengemudi agensi lain ke rute', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ routes: { baseRev: revOf('routes'), upserts: [Object.assign({}, rt1Rec, {
  from: 'Rute Hack'
})], deletes: [] } }, agenToken);
ok('sync agen tidak boleh mengubah field rute selain pengemudi', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ routes: { baseRev: revOf('routes'), upserts: [], deletes: ['rt_2'] } }, agenToken);
ok('sync agen tidak boleh menghapus rute', res.ok === false && res.error.code === 'FORBIDDEN', res);

const tempDriverBase = revOf('drivers');
res = sync({ drivers: { baseRev: tempDriverBase, upserts: [{
  id: 'd_temp', agencyId: 'ag_1', name: 'Pengemudi Sementara', status: 'aktif'
}], deletes: [] } }, adminToken);
ok('superadmin membuat pengemudi sementara untuk uji rute', res.ok === true && res.data.revisions.drivers === tempDriverBase + 1, res);
const rt1Latest = readRec('routes', 'rt_1');
res = sync({ routes: { baseRev: revOf('routes'), upserts: [Object.assign({}, rt1Latest, {
  driverIds: ['d_1', 'd_temp'], driverId: 'd_1'
})], deletes: [] } }, agenToken);
ok('agen menambahkan pengemudi sementara ke rute', res.ok === true, res);
const rt1WithTemp = readRec('routes', 'rt_1');
const routeCleanupBase = revOf('routes');
const driverCleanupBase = revOf('drivers');
res = sync({
  routes: { baseRev: routeCleanupBase, upserts: [Object.assign({}, rt1WithTemp, {
    driverIds: ['d_1'], driverId: 'd_1'
  })], deletes: [] },
  drivers: { baseRev: driverCleanupBase, upserts: [], deletes: ['d_temp'] }
}, agenToken);
ok('agen boleh menghapus pengemudi dan melepasnya dari rute dalam satu batch',
  res.ok === true &&
  res.data.revisions.routes === routeCleanupBase + 1 &&
  res.data.revisions.drivers === driverCleanupBase + 1, res);
res = sync({ drivers: { baseRev: revOf('drivers'), upserts: [], deletes: ['d_1'] } }, agenToken);
ok('pengemudi yang masih terpasang di armada tidak boleh dihapus',
  res.ok === false && res.error.code === 'VALIDATION', res);

/* Multi-koleksi: agen membuat akun pengemudi + data driver + armada + jadwal. */
const syncUserBase = revOf('users');
const syncDriverBase = revOf('drivers');
const syncVehicleBase = revOf('vehicles');
const syncScheduleBase = revOf('schedules');
const syncUser = {
  id: 'u_sync_driver', name: 'Driver Sync', email: 'sync.driver@test.local',
  phone: '081255580001', wa: '081255580001', role: 'pengemudi', agencyId: 'ag_1',
  status: 'active', pass: 'driver-sync-pw-123', profileStep: 'done', photo: ''
};
const syncDriverRec = {
  id: 'd_sync', agencyId: 'ag_1', name: 'Driver Sync', phone: '081255580001',
  userEmail: 'sync.driver@test.local', status: 'aktif', rating: 5, trips: 0
};
const syncVehicleRec = {
  id: 'v_sync_2', agencyId: 'ag_1', plate: 'BL 8888 SY', brand: 'Uji', model: 'Multi',
  status: 'aktif', capacity: 6, inactiveSeats: [], driverId: 'd_sync'
};
const syncScheduleRec = {
  id: 's_sync_1', agencyId: 'ag_1', routeId: 'rt_1', vehicleId: 'v_sync_2',
  driverId: 'd_sync', driverName: 'Driver Sync', backupDriverId: '', backupName: '',
  date: futureDate(3), time: '10:00', price: 150000, status: 'open',
  tripStatus: 'scheduled', blockedSeats: []
};
res = sync({
  users: { baseRev: syncUserBase, upserts: [syncUser], deletes: [] },
  drivers: { baseRev: syncDriverBase, upserts: [syncDriverRec], deletes: [] },
  vehicles: { baseRev: syncVehicleBase, upserts: [syncVehicleRec], deletes: [] },
  schedules: { baseRev: syncScheduleBase, upserts: [syncScheduleRec], deletes: [] }
}, agenToken);
ok('sync agen multi-koleksi membuat akun+driver+armada+jadwal',
  res.ok === true &&
  res.data.revisions.users === syncUserBase + 1 &&
  res.data.revisions.drivers === syncDriverBase + 1 &&
  res.data.revisions.vehicles === syncVehicleBase + 1 &&
  res.data.revisions.schedules === syncScheduleBase + 1, res);
res = login('sync.driver@test.local', 'driver-sync-pw-123');
ok('pengemudi hasil sync bisa login', res.ok === true && res.data.user.role === 'pengemudi', res);
res = sync({ schedules: { baseRev: revOf('schedules'), upserts: [Object.assign({}, syncScheduleRec, {
  id: 's_sync_bad_route', routeId: 'rt_2'
})], deletes: [] } }, agenToken);
ok('agen tidak boleh membuat jadwal pada rute agensi lain',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ vehicles: { baseRev: revOf('vehicles'), upserts: [], deletes: ['v_sync_2'] } }, agenToken);
ok('sync agen tidak boleh menghapus armada yang masih dipakai jadwal', res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ schedules: { baseRev: revOf('schedules'), upserts: [], deletes: ['s_1'] } }, agenToken);
ok('sync agen tidak boleh menghapus jadwal yang masih punya booking', res.ok === false && res.error.code === 'VALIDATION', res);

const s1Restore = readRec('schedules', 's_1');
res = sync({ schedules: { baseRev: revOf('schedules'), upserts: [Object.assign({}, s1Restore, {
  price: 150000
})], deletes: [] } }, agenToken);
ok('harga jadwal dikembalikan untuk uji pembayaran', res.ok === true, res);

const bSyncPaid = Object.assign({}, readRec('bookings', 'b_sync_1'), {
  status: 'paid', paidAt: '2026-10-24T05:15:00.000Z',
  fare: { ticket: 128889, service: 10000, fee: 11111, total: 150000 }
});
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [bSyncPaid], deletes: [] } }, custToken);
ok('pelanggan menandai booking sendiri lunas', res.ok === true, res);
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bSyncPaid, {
  status: 'cancelled', tripStatus: 'cancelled', refundPct: 100, refundAmount: 150000,
  refundScope: 'total', refundStatus: 'pending', refundPaidAt: null,
  cancelReason: 'Uji refund', cancelledBy: 'pelanggan', cancelledAt: '2026-10-24T05:16:00.000Z'
})], deletes: [] } }, custToken);
ok('sync menolak refund melebihi kebijakan pembatalan',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

const payBase = revOf('payments');
const ledgerBase = revOf('ledger');
const syncPayment = {
  id: 'p_sync_1', bookingId: 'b_sync_1', amount: 150000, method: 'transfer',
  status: 'pending', fee: 11111, time: '2026-10-24T05:20:00.000Z'
};
const syncLedger = {
  id: 'l_sync_1', agencyId: 'ag_1', bookingId: 'b_sync_1',
  scheduleId: 's_1', driverId: 'd_1', userEmail: 'cust1@test.local',
  seats: ['A4'], ticket: 128889, service: 10000, fee: 11111, total: 150000,
  status: 'ditahan', createdAt: '2026-10-24T05:20:00.000Z'
};
res = sync({ payments: { baseRev: payBase, upserts: [syncPayment], deletes: [] } }, custToken);
ok('sync pelanggan membuat pembayaran booking sendiri',
  res.ok === true && res.data.revisions.payments === payBase + 1, res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_refund_inject', refundStatus: 'done', refundAmount: 150000
})], deletes: [] } }, custToken);
ok('sync menolak pembayaran baru menyelipkan field refund',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({
  payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
    status: 'paid'
  })], deletes: [] },
  ledger: { baseRev: ledgerBase, upserts: [syncLedger], deletes: [] }
}, custToken);
ok('sync pelanggan menyelesaikan pembayaran+ledger booking sendiri',
  res.ok === true &&
  res.data.revisions.payments === payBase + 2 &&
  res.data.revisions.ledger === ledgerBase + 1, res);
const pSyncPaid = readRec('payments', 'p_sync_1');
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_2', bookingId: 'b_4'
})], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh membayar booking orang lain', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_fake_amount', amount: 1
})], deletes: [] } }, custToken);
ok('sync menolak nominal pembayaran tidak sesuai booking',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_fake_paid', status: 'paid'
})], deletes: [] } }, custToken);
ok('sync menolak pembayaran baru langsung lunas',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_duplicate'
})], deletes: [] } }, custToken);
ok('sync menolak pembayaran ganda untuk satu booking',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_fake_fee', fee: 1
})], deletes: [] } }, custToken);
ok('sync menolak fee pembayaran tidak sesuai perhitungan',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, pSyncPaid, {
  fee: 1
})], deletes: [] } }, custToken);
ok('sync menolak perubahan fee setelah pembayaran lunas',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, pSyncPaid, {
  amount: 1
})], deletes: [] } }, custToken);
ok('sync menolak perubahan nominal pembayaran',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, pSyncPaid, {
  refundStatus: 'done'
})], deletes: [] } }, custToken);
ok('sync menolak pelanggan menyelesaikan refund',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [], deletes: ['p_sync_1'] } }, custToken);
ok('sync menolak hapus pembayaran oleh pelanggan',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, syncLedger, {
  id: 'l_sync_fake_total', ticket: 1
})], deletes: [] } }, custToken);
ok('sync menolak nominal ledger tidak sesuai perhitungan',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, syncLedger, {
  id: 'l_sync_fake_agency', agencyId: 'ag_2'
})], deletes: [] } }, custToken);
ok('sync menolak agensi ledger tidak sesuai booking',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, syncLedger, {
  id: 'l_sync_fake_status', status: 'dicairkan'
})], deletes: [] } }, custToken);
ok('sync menolak ledger baru langsung dicairkan',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, readRec('ledger', 'l_sync_1'), {
  status: 'dicairkan'
})], deletes: [] } }, custToken);
ok('sync menolak transisi ledger tidak sah',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, readRec('ledger', 'l_sync_1'), {
  paidOutAt: '2026-10-24T05:30:00.000Z'
})], deletes: [] } }, custToken);
ok('sync menolak pelanggan mengisi pencairan ledger',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [], deletes: ['l_sync_1'] } }, custToken);
ok('sync menolak hapus ledger oleh pelanggan',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, syncLedger, {
  id: 'l_sync_duplicate'
})], deletes: [] } }, custToken);
ok('sync menolak ledger ganda untuk satu booking',
  res.ok === false && res.error.code === 'VALIDATION', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, syncLedger, {
  id: 'l_sync_paidout_inject', paidOutAt: '2026-10-24T06:00:00.000Z'
})], deletes: [] } }, custToken);
ok('sync menolak ledger baru dengan paidOutAt',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, readRec('ledger', 'l_sync_1'), {
  status: 'layak'
})], deletes: [] } }, custToken);
ok('sync pelanggan boleh melepas ledger ke layak',
  res.ok === true, res);
res = sync({ ledger: { baseRev: revOf('ledger'), upserts: [Object.assign({}, readRec('ledger', 'l_sync_1'), {
  status: 'dicairkan', paidOutAt: '2026-10-24T06:00:00.000Z'
})], deletes: [] } }, custToken);
ok('sync menolak pelanggan mencairkan ledger layak',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, syncBooking, {
  id: 'b_sync_agen', code: 'TA-AG', seats: ['A6'],
  passengers: [{ name: 'Agen', seat: 'A6' }]
})], deletes: [] } }, agenToken);
ok('sync menolak agen membuat booking baru',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, syncPayment, {
  id: 'p_sync_agen'
})], deletes: [] } }, agenToken);
ok('sync menolak agen membuat pembayaran baru',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

const driverBooking = {
  id: 'b_driver_sync', code: 'TA-DRV', scheduleId: 's_2', userEmail: null, userPhone: null,
  passengers: [{ name: 'Penumpang Driver', seat: 'A6' }], seats: ['A6'],
  subtotal: 150000, discount: 0, total: 150000, status: 'pending', payMethod: 'cash',
  voucher: '', source: 'driver', createdBy: 'd_1', createdAt: '2026-10-24T05:40:00.000Z',
  paidAt: null, holdExpiry: '2026-10-24T05:55:00.000Z', tripStatus: 'scheduled', boarded: false
};
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [driverBooking], deletes: [] } }, driverToken);
ok('sync pengemudi membuat booking driver di jadwalnya',
  res.ok === true, res);
const driverPayment = {
  id: 'p_driver_sync', bookingId: 'b_driver_sync', amount: 150000, method: 'cash',
  status: 'pending', fee: 11111, time: '2026-10-24T05:41:00.000Z'
};
res = sync({ payments: { baseRev: revOf('payments'), upserts: [driverPayment], deletes: [] } }, driverToken);
ok('sync pengemudi membuat pembayaran booking driver',
  res.ok === true, res);
res = sync({ payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, driverPayment, {
  status: 'paid'
})], deletes: [] } }, driverToken);
ok('sync menolak pembayaran lunas saat booking masih pending',
  res.ok === false && res.error.code === 'VALIDATION', res);
const driverFare = { ticket: 138889, service: 0, fee: 11111, total: 150000 };
res = sync({
  bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, driverBooking, {
    status: 'paid', paidAt: '2026-10-24T05:42:00.000Z', holdExpiry: null,
    fare: driverFare
  })], deletes: [] },
  payments: { baseRev: revOf('payments'), upserts: [Object.assign({}, driverPayment, {
    status: 'paid'
  })], deletes: [] },
  ledger: { baseRev: revOf('ledger'), upserts: [{
    id: 'l_driver_sync', bookingId: 'b_driver_sync', scheduleId: 's_2', agencyId: 'ag_1',
    driverId: 'd_2', userEmail: null, seats: ['A6'], ticket: 138889, service: 0,
    fee: 11111, total: 150000, status: 'ditahan', createdAt: '2026-10-24T05:42:00.000Z'
  }], deletes: [] }
}, driverToken);
ok('sync pengemudi menyelesaikan booking driver + ledger',
  res.ok === true, res);

const fakeMaintenanceCancel = Object.assign({}, bSyncPaid, {
  status: 'cancelled', tripStatus: 'cancelled', maintenanceState: 'refunded',
  maintenanceResolvedAt: '2026-10-24T05:50:00.000Z',
  refundPct: 100, refundAmount: 150000, refundScope: 'total',
  refundStatus: 'pending', refundPaidAt: null, cancelReason: 'Palsu',
  cancelledBy: 'pelanggan', cancelledAt: '2026-10-24T05:50:00.000Z'
});
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [fakeMaintenanceCancel], deletes: [] } }, custToken);
ok('sync menolak refund maintenance tanpa jadwal maintenance',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

const s1Ref = readRec('schedules', 's_1');
const s2Ref = readRec('schedules', 's_2');
res = sync({ schedules: { baseRev: revOf('schedules'), upserts: [
  Object.assign({}, s1Ref, {
    maintenanceStatus: 'active', maintenanceFrom: s1Ref.date, maintenanceUntil: s1Ref.date,
    maintenanceRequestId: 'm_1'
  }),
  Object.assign({}, s2Ref, {
    maintenanceStatus: 'active', maintenanceFrom: s2Ref.date, maintenanceUntil: s2Ref.date,
    maintenanceRequestId: 'm_1'
  })
], deletes: [] } }, agenToken);
ok('agen menandai jadwal maintenance untuk uji refund',
  res.ok === true, res);

const bDriverPaid = readRec('bookings', 'b_driver_sync');
res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, bDriverPaid, {
  status: 'cancelled', tripStatus: 'cancelled', maintenanceState: 'refunded',
  maintenanceResolvedAt: '2026-10-24T05:51:00.000Z',
  refundPct: 100, refundAmount: 150000, refundScope: 'total',
  refundStatus: 'pending', refundPaidAt: null, cancelReason: 'Uji driver',
  cancelledBy: 'pengemudi', cancelledAt: '2026-10-24T05:51:00.000Z'
})], deletes: [] } }, driverToken);
ok('sync menolak pengemudi refund di luar pembatalan jadwal',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

res = sync({ bookings: { baseRev: revOf('bookings'), upserts: [Object.assign({}, fakeMaintenanceCancel, {
  maintenanceState: 'refunded', maintenanceResolvedAt: '2026-10-24T05:52:00.000Z'
})], deletes: [] } }, custToken);
ok('sync mengizinkan refund maintenance 100% saat jadwal maintenance',
  res.ok === true, res);

const n1Rec = readRec('notifications', 'n_1');
const n2Rec = readRec('notifications', 'n_2');
const notifBase = revOf('notifications');
res = sync({ notifications: { baseRev: notifBase, upserts: [Object.assign({}, n1Rec, { read: true })], deletes: [] } }, custToken);
ok('sync pelanggan menandai notifikasi sendiri', res.ok === true && res.data.revisions.notifications === notifBase + 1, res);
res = sync({ notifications: { baseRev: revOf('notifications'), upserts: [Object.assign({}, n2Rec, { read: true })], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh menandai notifikasi orang lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const selfNotif = {
  id: 'n_sync_self', to: 'cust1@test.local', title: 'Aktivitas saya',
  msg: 'Notifikasi lokal untuk akun sendiri', ch: 'app',
  time: '2026-10-24T05:25:00.000Z', read: false
};
const selfNotifBase = revOf('notifications');
res = sync({ notifications: { baseRev: selfNotifBase, upserts: [selfNotif], deletes: [] } }, custToken);
ok('sync pelanggan boleh membuat notifikasi untuk diri sendiri',
  res.ok === true && res.data.revisions.notifications === selfNotifBase + 1, res);
res = sync({ notifications: { baseRev: revOf('notifications'), upserts: [Object.assign({}, selfNotif, {
  id: 'n_sync_other', to: 'cust2@test.local'
})], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh membuat notifikasi untuk orang lain',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

const supportBase = revOf('supportTickets');
const syncTicket = {
  id: 'st_sync_1', code: 'ADU-S1', channel: 'report', userId: 'u_cust_1',
  userEmail: 'cust1@test.local', userName: 'Rina', userPhone: '0812000005',
  agencyId: null, isGuest: false, category: 'Lainnya', subject: 'Uji sync',
  bookingCode: '', description: '', status: 'new', messages: [], statusHistory: [],
  createdAt: '2026-10-24T05:30:00.000Z', updatedAt: '2026-10-24T05:30:00.000Z'
};
res = sync({ supportTickets: { baseRev: supportBase, upserts: [syncTicket], deletes: [] } }, custToken);
ok('sync pelanggan membuat tiket support sendiri', res.ok === true && res.data.revisions.supportTickets === supportBase + 1, res);
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, syncTicket, {
  id: 'st_sync_2', code: 'ADU-S2', userId: 'u_cust_2', userEmail: 'cust2@test.local'
})], deletes: [] } }, custToken);
ok('sync pelanggan tidak boleh membuat tiket atas nama orang lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const st2Rec = readRec('supportTickets', 'st_2');
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, st2Rec, { status: 'resolved' })], deletes: [] } }, agenToken);
ok('sync agen menangani tiket agensinya', res.ok === true, res);
const st4Rec = readRec('supportTickets', 'st_4');
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, st4Rec, { status: 'resolved' })], deletes: [] } }, agenToken);
ok('sync agen tidak boleh menangani tiket agensi lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const st1Rec = readRec('supportTickets', 'st_1');
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, st1Rec, {
  messages: [{ id: 'MSG_HACK', from: 'cs', text: 'Pesan CS palsu', author: 'CS', at: '2026-10-24T05:35:00.000Z' }]
})], deletes: [] } }, custToken);
ok('pelanggan tidak boleh menyisipkan pesan CS palsu', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, st1Rec, {
  status: 'resolved'
})], deletes: [] } }, custToken);
ok('pelanggan tidak boleh menutup tiket sendiri secara paksa', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, syncTicket, {
  id: 'st_sync_guest', code: 'ADU-GUEST', isGuest: true
})], deletes: [] } }, custToken);
ok('tiket guest tidak boleh disinkronkan sebagai tiket akun', res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ supportTickets: { baseRev: revOf('supportTickets'), upserts: [Object.assign({}, syncTicket, {
  id: 'st_sync_agency', code: 'ADU-AG', agencyId: 'ag_1'
})], deletes: [] } }, custToken);
ok('pelanggan tidak boleh menempelkan tiket ke agensi', res.ok === false && res.error.code === 'FORBIDDEN', res);

const rrBase = revOf('routeRequests');
const syncRr = { id: 'rr_sync_1', agencyId: 'ag_1', type: 'rute-baru', status: 'pending', from: 'X', to: 'Y' };
res = sync({ routeRequests: { baseRev: rrBase, upserts: [syncRr], deletes: [] } }, agenToken);
ok('sync agen membuat usulan rute sendiri', res.ok === true && res.data.revisions.routeRequests === rrBase + 1, res);
res = sync({ routeRequests: { baseRev: revOf('routeRequests'), upserts: [Object.assign({}, syncRr, { id: 'rr_sync_2', agencyId: 'ag_2' })], deletes: [] } }, agenToken);
ok('sync agen tidak boleh membuat usulan untuk agensi lain', res.ok === false && res.error.code === 'FORBIDDEN', res);

const mBase = revOf('maintenanceRequests');
const syncMaint = {
  id: 'm_sync_1', agencyId: 'ag_1', driverId: 'd_1', vehicleId: 'v_1',
  status: 'menunggu', from: futureDate(5), until: futureDate(6),
  requestedAt: '2026-10-24T05:40:00.000Z'
};
res = sync({ maintenanceRequests: { baseRev: mBase, upserts: [syncMaint], deletes: [] } }, driverToken);
ok('sync pengemudi membuat maintenance sendiri', res.ok === true && res.data.revisions.maintenanceRequests === mBase + 1, res);
res = sync({ maintenanceRequests: { baseRev: revOf('maintenanceRequests'), upserts: [Object.assign({}, syncMaint, {
  id: 'm_sync_2', driverId: 'd_3'
})], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh membuat maintenance pengemudi lain', res.ok === false && res.error.code === 'FORBIDDEN', res);
const m1Rec = readRec('maintenanceRequests', 'm_1');
res = sync({ maintenanceRequests: { baseRev: revOf('maintenanceRequests'), upserts: [Object.assign({}, m1Rec, {
  status: 'disetujui', decidedAt: '2026-10-24T06:00:00.000Z',
  decidedBy: 'driver1@test.local', decisionNote: 'Setujui sendiri'
})], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh menyetujui maintenance sendiri',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ maintenanceRequests: { baseRev: revOf('maintenanceRequests'), upserts: [Object.assign({}, readRec('maintenanceRequests', 'm_sync_1'), {
  status: 'dibatalkan', decidedAt: '2026-10-24T06:00:00.000Z',
  decidedBy: 'driver1@test.local', decisionNote: 'Batal'
})], deletes: [] } }, driverToken);
ok('sync pengemudi boleh membatalkan maintenance sendiri yang menunggu',
  res.ok === true, res);

const driverSelfRec = readRec('drivers', 'd_1');
res = sync({ drivers: { baseRev: revOf('drivers'), upserts: [Object.assign({}, driverSelfRec, {
  userEmail: 'driver3@test.local'
})], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh mengganti email penaut data driver',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ drivers: { baseRev: revOf('drivers'), upserts: [Object.assign({}, driverSelfRec, {
  status: 'nonaktif'
})], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh mengubah status driver sendiri',
  res.ok === false && res.error.code === 'FORBIDDEN', res);
res = sync({ drivers: { baseRev: revOf('drivers'), upserts: [Object.assign({}, driverSelfRec, {
  phone: '081299990001'
})], deletes: [] } }, driverToken);
ok('sync pengemudi boleh mengubah kontak sendiri',
  res.ok === true, res);
res = sync({ drivers: { baseRev: revOf('drivers'), upserts: [{
  id: 'd_self_duplicate', agencyId: 'ag_1', name: 'Duplikat',
  userEmail: 'driver1@test.local', status: 'aktif'
}], deletes: [] } }, driverToken);
ok('sync pengemudi tidak boleh membuat data driver duplikat',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

/* ------------------------------------------------------------------ */
/* 10) throttle login & changePassword                                 */
/* ------------------------------------------------------------------ */

console.log('\n== 10) throttling ==');
clearRateLimits();
res = dispatch(bodyOf({ name: 'Throttle User', email: 'throttle@test.local', phone: '081255570001', password: THROTTLE_PW, role: 'pelanggan' }, { action: 'register' }));
ok('register akun uji throttle', res.ok === true, res);
for (let i = 0; i < 5; i++) {
  res = login('throttle@test.local', 'salah-terus-' + i);
  ok('login gagal #' + (i + 1) + ' tetap UNAUTHORIZED', res.ok === false && res.error.code === 'UNAUTHORIZED', res);
}
res = login('throttle@test.local', THROTTLE_PW);
ok('setelah 5 gagal, login benar diblokir sementara', res.ok === false && res.error.code === 'RATE_LIMITED', res);
clearRateLimits();
res = login('throttle@test.local', THROTTLE_PW);
ok('setelah cache dibersihkan, login benar sukses', res.ok === true, res);

clearRateLimits();
res = dispatch(bodyOf({ name: 'Chpw User', email: 'chpw@test.local', phone: '081255570002', password: CHPW_PW, role: 'pelanggan' }, { action: 'register' }));
ok('register akun uji ganti password', res.ok === true && typeof res.data.token === 'string', res);
const chpwToken = res.ok ? res.data.token : '';
for (let i = 0; i < 5; i++) {
  res = dispatch(bodyOf({ currentPassword: 'salah-lama-' + i, newPassword: 'x-password-123' }, { action: 'changePassword', token: chpwToken }));
  ok('ganti password gagal #' + (i + 1) + ' UNAUTHORIZED', res.ok === false && res.error.code === 'UNAUTHORIZED', res);
}
res = dispatch(bodyOf({ currentPassword: CHPW_PW, newPassword: 'x-password-456' }, { action: 'changePassword', token: chpwToken }));
ok('setelah 5 gagal, ganti password diblokir sementara', res.ok === false && res.error.code === 'RATE_LIMITED', res);
clearRateLimits();
res = dispatch(bodyOf({ currentPassword: CHPW_PW, newPassword: CHPW_FINAL_PW }, { action: 'changePassword', token: chpwToken }));
ok('setelah cache dibersihkan, ganti password sukses', res.ok === true, res);

/* ------------------------------------------------------------------ */
/* 11) doGet / doPost (HTTP layer)                                     */
/* ------------------------------------------------------------------ */

console.log('\n== 11) doGet / doPost (HTTP layer) ==');
const healthOut = S.doGet({});
const healthObj = JSON.parse(healthOut.text);
ok('doGet health ok', healthObj.ok === true && healthObj.data.version === '1.3.0', healthObj);

const postOut = S.doPost({ postData: { contents: JSON.stringify({ action: 'login', proxyKey: 'proxy-salah-xyz', email: 'admin@transaceh.id', password: 'andai-sah' }) } });
const postObj = JSON.parse(postOut.text);
responses.push(postOut.text);
ok('doPost dengan proxyKey salah memberi PROXY_FORBIDDEN', postObj.ok === false && postObj.error.code === 'PROXY_FORBIDDEN', postObj);

const postLogin = S.doPost({ postData: { contents: JSON.stringify({ action: 'login', email: 'throttle@test.local', password: THROTTLE_PW }) } });
const postLoginObj = JSON.parse(postLogin.text);
responses.push(postLogin.text);
ok('doPost direct (tanpa proxyKey) login sukses', postLoginObj.ok === true && typeof postLoginObj.data.token === 'string', postLoginObj);

const postBad = S.doPost({ postData: { contents: '{bukan-json' } });
const postBadObj = JSON.parse(postBad.text);
responses.push(postBad.text);
ok('doPost body bukan JSON -> VALIDATION', postBadObj.ok === false && postBadObj.error.code === 'VALIDATION', postBadObj);

/* ------------------------------------------------------------------ */
/* 12) kebocoran secret / plaintext                                    */
/* ------------------------------------------------------------------ */

console.log('\n== 12) kebocoran secret / kehadiran plaintext ==');
const allPasswords = [
  LEGACY_ADMIN_PW, LEGACY_AGEN_PW, LEGACY_AGEN2_PW, LEGACY_DRIVER1_PW,
  LEGACY_CUST1_PW, LEGACY_CUST2_PW, NEW_ADMIN_PW, REG_PAX_PW, REG_AGEN_PW,
  THROTTLE_PW, CHPW_PW, NEW_CUST2_PW, CHPW_FINAL_PW, DRIVER_NEW_PW, AGEN_NEW_PW
];
const forbiddenSubstrings = [
  proxyKey,
  scriptProperties.get('API_TOKEN_SECRET'),
  scriptProperties.get('PASSWORD_PEPPER'),
  ...allPasswords
];
let leakFound = false;
responses.forEach((text, index) => {
  if (forbiddenSubstrings.some((needle) => needle && text.includes(needle))) {
    leakFound = true;
    console.log('  LEAK di response #' + index + ':', text.slice(0, 200));
  }
});
ok('tidak ada secret/plaintext password di response', !leakFound);

const logLeak = logs.some((line) => forbiddenSubstrings.some((needle) => needle && line.includes(needle)));
ok('tidak ada secret/password di Logger.log', !logLeak, logs);
ok('tidak ada passHash dkk di response manapun',
  !responses.some((text) => text.includes('"passHash"') || text.includes('"passSalt"') || text.includes('"passIter"') || text.includes('"passAlgo"')));

const migratedIds = ['u_admin_1', 'u_agen_1', 'u_driver_1', 'u_cust_1', 'u_cust_2'];
const migratedRecs = migratedIds.map((id) => readRec('users', id));
ok('akun yang sudah login/reset memakai hash', migratedRecs.length === migratedIds.length &&
  migratedRecs.every((r) => !!r && typeof r.passHash === 'string' && r.passHash.length > 20 &&
    !allPasswords.some((pw) => JSON.stringify(r || {}).includes(pw))), migratedRecs.map((r) => r && r.id));
ok('akun baru (register/admin) memakai hash', (() => {
  const recMan = readRec('users', newCustId);
  return !!recMan && typeof recMan.passHash === 'string' && !JSON.stringify(recMan).includes(REG_PAX_PW);
})());

const publicAndRoleJson = JSON.stringify(publicRecords) +
  JSON.stringify(custRecords.agencies || []) +
  JSON.stringify(driverRecords.agencies || []);
ok('proyeksi publik tidak memuat NIK/NPWP/foto KTP/rekening',
  !publicAndRoleJson.includes(kyc1.nik) &&
  !publicAndRoleJson.includes(kyc2.nik) &&
  !publicAndRoleJson.includes(kyc1.npwp) &&
  !publicAndRoleJson.includes('fotoKtp') &&
  !publicAndRoleJson.includes(kyc1.rekeningNo),
  'periksa kembali proyeksi');

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 13) round-trip storage v2                                           */
/* ------------------------------------------------------------------ */

console.log('\n== 13) round-trip skema kolom (tulis ulang via engine) ==');
seedKeys.forEach((key) => {
  const before = S.apiReadCollection_(spread, key);
  try {
    S.apiWriteCollection_(spread, key, before);
  } catch (err) {
    ok('tulis ulang koleksi ' + key, false, (err && err.message) || err);
    return;
  }
  const after = S.apiReadCollection_(spread, key);
  ok('round-trip ' + key + ' identik', schemaRecordsEqual(before, after), key);
});

let bigCellErr = '';
try {
  S.apiWriteCollection_(spread, 'banners', [{ id: 'bnr_big', title: 'x'.repeat(46000), sub: '', active: true }]);
} catch (err) {
  bigCellErr = String((err && err.message) || err);
}
ok('sel di atas 45000 karakter ditolak', bigCellErr.indexOf('melebihi') >= 0, bigCellErr);

let unknownFieldErr = '';
try {
  S.apiWriteCollection_(spread, 'banners', [{ id: 'bnr_unknown', title: 'uji', fieldKhusus: 1 }]);
} catch (err) {
  unknownFieldErr = String((err && err.message) || err);
}
ok('field di luar skema ditolak tanpa data loss', unknownFieldErr.indexOf('tidak dikenal') >= 0, unknownFieldErr);

/* ------------------------------------------------------------------ */
/* 14) blob chunk dokumen KYC (dataUrl melebihi satu sel Sheets)        */
/* ------------------------------------------------------------------ */

console.log('\n== 14) blob chunk dokumen KYC ==');

function blobRowsFor(id) {
  const sh = spread.getSheetByName('agency_kyc_doc_blob');
  const n = sh.getLastRow();
  const rows = n > 1 ? sh.getRange(2, 1, n - 1, 4).getValues() : [];
  return rows.filter((r) => String(r[0]).trim() === String(id));
}

const BIG_URL = 'data:image/png;base64,' + 'B'.repeat(150000);
const SMALL_URL = 'data:image/png;base64,SMALL';
const blobAgency = {
  id: 'ag_blob', name: 'Agen Blob', address: '-', phone: '-', bank: '-',
  status: 'pending', feeType: 'percent', feeValue: 8, rating: 0, trips: 0,
  kyc: { nama: 'Agen Blob KYC', docs: {
    ktp: { name: 'ktp.png', type: 'image/png', size: 112500, dataUrl: BIG_URL, at: '2026-10-26T00:00:00.000Z' },
    kecil: { name: 'kecil.png', type: 'image/png', size: 14, dataUrl: SMALL_URL, at: '2026-10-26T00:00:00.000Z' }
  } }
};
res = sync({ agencies: { baseRev: revOf('agencies'), upserts: [blobAgency], deletes: [] } }, adminToken);
ok('sync agensi dengan dataUrl raksasa diterima (chunk blob)', res.ok === true, res);

let blobRec = readRec('agencies', 'ag_blob');
ok('dataUrl besar dibaca ulang utuh dari gabungan chunk',
  !!blobRec && blobRec.kyc && blobRec.kyc.docs &&
  blobRec.kyc.docs.ktp.dataUrl === BIG_URL &&
  blobRec.kyc.docs.kecil.dataUrl === SMALL_URL,
  blobRec && blobRec.kyc && Object.keys(blobRec.kyc.docs || {}));

const blobKtpRows = blobRowsFor('ag_blob').filter((r) => String(r[1]).trim() === 'ktp');
ok('dataUrl 150.022 karakter dipecah menjadi 4 chunk', blobKtpRows.length === 4, blobKtpRows.length);
ok('nomor urut chunk rapi (1..4)', blobKtpRows.map((r) => Number(r[2])).join(',') === '1,2,3,4',
  blobKtpRows.map((r) => r[2]));
ok('setiap chunk ≤ 45000 karakter',
  blobKtpRows.every((r) => String(r[3]).length <= 45000),
  blobKtpRows.map((r) => String(r[3]).length));
ok('gabungan chunk identik dengan dataUrl asli',
  blobKtpRows.map((r) => String(r[3])).join('') === BIG_URL);
ok('kolom metadata agency_kyc_docs tanpa dataUrl',
  JSON.stringify(spread.getSheetByName('agency_kyc_docs').getRange(1, 1, 1, 6).getValues()[0]) ===
  JSON.stringify(['parent_id', 'key', 'name', 'type', 'size', 'at']));

blobRec = readRec('agencies', 'ag_blob');
blobRec.kyc.docs.ktp = { name: 'ktp.png', type: 'image/png', size: 15, dataUrl: SMALL_URL, at: '2026-10-26T01:00:00.000Z' };
res = sync({ agencies: { baseRev: revOf('agencies'), upserts: [blobRec], deletes: [] } }, adminToken);
ok('ganti dokumen besar dengan kecil tersinkron', res.ok === true, res);
ok('chunk lama menipis menjadi 1 baris per dokumen',
  blobRowsFor('ag_blob').length === 2 &&
  readRec('agencies', 'ag_blob').kyc.docs.ktp.dataUrl === SMALL_URL,
  blobRowsFor('ag_blob').length);

blobRec = readRec('agencies', 'ag_blob');
blobRec.kyc.docs = {};
res = sync({ agencies: { baseRev: revOf('agencies'), upserts: [blobRec], deletes: [] } }, adminToken);
ok('hapus seluruh dokumen membersihkan tab blob juga', res.ok === true && blobRowsFor('ag_blob').length === 0, blobRowsFor('ag_blob').length);
ok('kyc tanpa dokumen terbaca tanpa docs',
  !readRec('agencies', 'ag_blob').kyc.docs, readRec('agencies', 'ag_blob').kyc);

/* ------------------------------------------------------------------ */
/* 15) ensureSchema: migrasi agency_kyc_docs versi lama (dataUrl inline) */
/* ------------------------------------------------------------------ */

console.log('\n== 15) ensureSchema migrasi dataUrl lama ==');
const OLD_BIG = 'data:image/png;base64,' + 'X'.repeat(120000);
const OLD_SMALL = 'data:image/png;base64,OLD';
const docsSheetOld = spread.getSheetByName('agency_kyc_docs');
docsSheetOld.clearContents();
docsSheetOld.getRange(1, 1, 1, 7).setValues([
  ['parent_id', 'key', 'name', 'type', 'size', 'dataUrl', 'at']
]);
docsSheetOld.getRange(2, 1, 2, 7).setValues([
  ['ag_blob', 'ktp', 'ktp.png', 'image/png', 90000, OLD_BIG, '2026-10-01T00:00:00.000Z'],
  ['ag_blob', 'kecil', 'kecil.png', 'image/png', 5, OLD_SMALL, '2026-10-01T00:00:00.000Z']
]);

const ensureRes = S.ensureSchema_();
ok('ensureSchema terjalankan tanpa reset', ensureRes.ok === true &&
  ensureRes.fixes.some((f) => f.indexOf('agency_kyc_docs dimigrasi') === 0), ensureRes);
ok('header agency_kyc_docs ditulis ulang ke versi blob',
  JSON.stringify(docsSheetOld.getRange(1, 1, 1, 6).getValues()[0]) ===
  JSON.stringify(['parent_id', 'key', 'name', 'type', 'size', 'at']),
  docsSheetOld.getRange(1, 1, 1, 6).getValues()[0]);

const migRows = blobRowsFor('ag_blob');
ok('dataUrl inline lama pindah menjadi 2 dokumen × chunk',
  migRows.filter((r) => String(r[1]).trim() === 'ktp').map((r) => String(r[3])).join('') === OLD_BIG &&
  migRows.filter((r) => String(r[1]).trim() === 'kecil').map((r) => String(r[3])).join('') === OLD_SMALL &&
  migRows.filter((r) => String(r[1]).trim() === 'ktp').every((r) => String(r[3]).length <= 45000),
  migRows.length);
const migRec = readRec('agencies', 'ag_blob');
ok('membaca ulang record setelah migrasi utuh',
  !!migRec.kyc && !!migRec.kyc.docs &&
  migRec.kyc.docs.ktp.dataUrl === OLD_BIG &&
  migRec.kyc.docs.kecil.dataUrl === OLD_SMALL);
ok('_meta.tableCount diperbarui ke jumlah tab skema',
  (() => {
    const meta = spread.getSheetByName('_meta');
    const n = meta.getLastRow();
    const rows = n > 1 ? meta.getRange(2, 1, n - 1, 2).getValues() : [];
    const row = rows.find((r) => String(r[0]).trim() === 'tableCount');
    return !!row && String(row[1]) === String(S.apiDescribeStore_().tables.length);
  })());

/* ------------------------------------------------------------------ */
/* 16) validateDatabase sadar-skema: kolom ke-2 kind 'one' itu data     */
/* ------------------------------------------------------------------ */

console.log('\n== 16) validateDatabase: slot sadar-skema ==');

const agBlobNow = readRec('agencies', 'ag_blob');
agBlobNow.kyc.alamatUsaha = {
  jalan: '', kelurahan: 'Kuta Baru', kecamatan: 'Kuta Cot Glie',
  kota: 'Kabupaten Aceh Besar', provinsi: 'Aceh', kodePos: '23930'
};
const agenciesAll = S.apiReadCollection_(spread, 'agencies');
agenciesAll.forEach((r, i) => { if (String(r.id) === 'ag_blob') agenciesAll[i] = agBlobNow; });
S.apiWriteCollection_(spread, 'agencies', agenciesAll);
const vdOk = S.validateDatabase();
ok('baris kind one dengan kolom data pertama kosong lolos validasi',
  vdOk.ok === true && !vdOk.problems.some((p) => p.indexOf('batch/slot kosong') >= 0),
  vdOk.problems);
ok('kepala tab one tetap terhitung', vdOk.counts.agency_kyc_alamat_usaha === 1,
  vdOk.counts.agency_kyc_alamat_usaha);

const refundSheet = spread.getSheetByName('agencies_refund_policy');
refundSheet.getRange(refundSheet.getLastRow() + 1, 1, 1, 4).setValues([['ag_blob', '', '', '']]);
const vdBad = S.validateDatabase();
ok('baris list map blob tanpa tetap slot tetap dilaporkan',
  vdBad.ok === false && vdBad.problems.some((p) =>
    p.indexOf('agencies_refund_policy') === 0 && p.indexOf('batch/slot kosong') >= 0),
  vdBad.problems);

/* ------------------------------------------------------------------ */
/* 17) driver_alamat: alamat berjenjang pengemudi (kind one)           */
/* ------------------------------------------------------------------ */

console.log('\n== 17) driver_alamat pengemudi ==');

/* Buang baris bermasalah yang sengaja dipasang pada seksi 16 supaya
   validateDatabase kembali hijau untuk seksi ini. */
const lastRefund = refundSheet.getLastRow();
if (lastRefund > 1) refundSheet.getRange(lastRefund, 1, 1, 4).clearContent();

const D1_ADDR = {
  jalan: 'Jl. Tuan Haji', rtRw: '001/002', kelurahan: 'Lampineung',
  kecamatan: 'Baiturrahman', kota: 'Kota Banda Aceh', provinsi: 'Aceh',
  kodePos: '23112'
};
const D1_ADDR_STR = 'Jl. Tuan Haji, RT 001/RW 002, Lampineung, Baiturrahman, Kota Banda Aceh, Aceh 23112';
/* driverToken = driver1@test.local → ownDriverId = d_1 (cocok via userEmail). */
const d1Now = readRec('drivers', 'd_1');
res = sync({
  drivers: {
    baseRev: revOf('drivers'),
    upserts: [Object.assign({}, d1Now, {
      address: D1_ADDR_STR,
      alamat: D1_ADDR
    })],
    deletes: []
  }
}, driverToken);
ok('pengemudi memperbarui alamat berjenjang sendiri (whitelist alamat)', res.ok === true, res);

const d1Read = readRec('drivers', 'd_1');
ok('alamat berjenjang tersimpan & terbaca kembali identik',
  schemaValueEqual(d1Read.alamat, D1_ADDR) && d1Read.address ===
  D1_ADDR_STR);

/* Whitelist self-edit pengemudi tetap menolak field di luar daftar. */
res = sync({
  drivers: {
    baseRev: revOf('drivers'),
    upserts: [Object.assign({}, readRec('drivers', 'd_1'), { name: 'Nama Beda' })],
    deletes: []
  }
}, driverToken);
ok('whitelist self-edit pengemudi masih menolak perubahan nama sendiri',
  res.ok === false && res.error.code === 'FORBIDDEN', res);

const vdDrv = S.validateDatabase();
ok('validateDatabase: tab driver_alamat terbentuk & valid',
  vdDrv.ok === true && vdDrv.counts.driver_alamat === 1 &&
  !vdDrv.problems.some((p) => p.indexOf('driver_alamat') >= 0),
  vdDrv.counts.driver_alamat);

/* ------------------------------------------------------------------ */
/* 18) foto pengemudi & kendaraan → tab sblob (dupa chunk ≤45rb)       */
/* ------------------------------------------------------------------ */

console.log('\n== 18) foto pengemudi & kendaraan di tab sblob ==');

/* dataURL "nyata" > 45rb karakter — persis kasus produksi yang dulu gagal
   dengan VALIDATION "Isi sel ... melebihi 45000 karakter". */
const BIG_PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(60000);
const BIG_SIM = 'data:image/jpeg;base64,' + 'B'.repeat(50000);
const BIG_STNK = 'data:image/png;base64,' + 'C'.repeat(55000);
const BIG_LEGACY = 'data:image/jpeg;base64,' + 'D'.repeat(55000);

/* Agen memperbarui foto pengemudi; sync harus diterima penuh. */
res = sync({
  drivers: {
    baseRev: revOf('drivers'),
    upserts: [Object.assign({}, readRec('drivers', 'd_1'), {
      photo: BIG_PHOTO, simPhoto: BIG_SIM
    })],
    deletes: []
  }
}, agenToken);
ok('sync foto besar pengemudi (sisi agen) diterima', res.ok === true, res);

const d1Big = readRec('drivers', 'd_1');
ok('foto pengemudi terbaca kembali identik (chunk digabung)',
  schemaValueEqual(d1Big.photo, BIG_PHOTO) && schemaValueEqual(d1Big.simPhoto, BIG_SIM));

/* Sel utama kolom ghost tidak menyimpan nilai besar. */
const drvRowsRaw = spread.getSheetByName('drivers').rows;
const drvHdr = drvRowsRaw[0];
const d1RawRow = drvRowsRaw.find((r) => String(r[0]) === 'd_1');
ok('kolom ghost photo/simPhoto kosong di tab utama',
  String(d1RawRow[drvHdr.indexOf('photo')] || '') === '' &&
  String(d1RawRow[drvHdr.indexOf('simPhoto')] || '') === '');

const blobDrvRows = spread.getSheetByName('driver_doc_blob').rows.filter(
  (r) => String(r[0]) === 'd_1');
const chunksOf = (list, field) => list.filter((r) => String(r[1]) === field)
  .map((r) => [Number(r[2]) || 0, String(r[3])])
  .sort((x, y) => x[0] - y[0]).map((p) => p[1]).join('');
ok('chunk foto pengemudi tersusun urut & tergabung utuh',
  chunksOf(blobDrvRows, 'photo') === BIG_PHOTO &&
  chunksOf(blobDrvRows, 'simPhoto') === BIG_SIM,
  blobDrvRows.length);

/* Foto/STNK kendaraan lewat jalur yang sama. */
res = sync({
  vehicles: {
    baseRev: revOf('vehicles'),
    upserts: [Object.assign({}, readRec('vehicles', 'v_1'), { stnkPhoto: BIG_STNK })],
    deletes: []
  }
}, agenToken);
ok('sync STNK besar kendaraan (sisi agen) diterima', res.ok === true, res);
const v1Big = readRec('vehicles', 'v_1');
ok('STNK kendaraan terbaca kembali identik', schemaValueEqual(v1Big.stnkPhoto, BIG_STNK));

/* Data lama: nilai besar tertanam langsung di sel utama (pra-migrasi). */
const d2RawRow = drvRowsRaw.find((r) => String(r[0]) === 'd_2');
d2RawRow[drvHdr.indexOf('photo')] = BIG_LEGACY;
const vdLegacy = S.validateDatabase();
ok('validateDatabase menandai sel foto lama yang melebihi batas',
  vdLegacy.ok === false &&
  vdLegacy.problems.some((p) => p.indexOf('drivers') === 0 && p.indexOf('melebihi') >= 0));

const ensure2 = S.ensureSchema_();
ok('ensureSchema memindahkan foto lama ke tab blob',
  ensure2.ok === true && (ensure2.fixes || []).join(' ').indexOf('dipindah') >= 0, ensure2);
ok('foto lama terbaca identik setelah migrasi',
  schemaValueEqual(readRec('drivers', 'd_2').photo, BIG_LEGACY));

/* Migrasi idempoten: sel sudah kosong → tidak ada fix baru. */
const ensure3 = S.ensureSchema_();
ok('migrasi foto idempoten (tidak menulis ulang)',
  ensure3.ok === true && (ensure3.fixes || []).every((f) => f.indexOf('dipindah') < 0), ensure3);

const vdDrvBlob = S.validateDatabase();
ok('validateDatabase hijau untuk seluruh tab foto blob',
  vdDrvBlob.ok === true && vdDrvBlob.counts.driver_doc_blob >= 4 &&
  vdDrvBlob.counts.vehicle_doc_blob >= 2, vdDrvBlob.problems);

/* ------------------------------------------------------------------ */

/* Proyeksi pengemudi: baris sendiri tetap hadir meski belum punya jadwal.
   Lepaskan d_1 dari semua jadwal (s_1 utama → d_2, s_2 cadangan → kosong). */
const schedRawRows = spread.getSheetByName('schedules').rows;
const sHdr = schedRawRows[0];
const idxDrv = sHdr.indexOf('driverId');
const idxDnm = sHdr.indexOf('driverName');
const idxBd = sHdr.indexOf('backupDriverId');
const idxBn = sHdr.indexOf('backupName');
schedRawRows.forEach((r) => {
  if (String(r[0]) === 's_1') { r[idxDrv] = 'd_2'; r[idxDnm] = 'Teuku Rizal'; }
  if (String(r[0]) === 's_2') { r[idxBd] = ''; r[idxBn] = ''; }
});
res = dispatch(bodyOf({}, { action: 'bootstrap', token: driverToken }));
ok('bootstrap pengemudi tanpa jadwal tetap memuat baris sendiri',
  res.ok === true && (res.data.records.drivers || []).some((x) => String(x.id) === 'd_1'),
  (res.data.records.drivers || []).map((x) => x.id));

/* ------------------------------------------------------------------ */
/* 16) Upload KTP via agen + penghapusan swafoto (`selfie`)            */

console.log('\n== 16) upload KTP agen + penghapusan kolom selfie ==');

/* Skema baru tidak lagi mengenal selfie. */
const drvHdrLive = spread.getSheetByName('drivers').rows[0].join('|');
ok('tab drivers tanpa kolom selfie', drvHdrLive.indexOf('selfie') === -1, drvHdrLive);

/* Foto KTP besar lewat jalur agen (form Tambah Pengemudi) → tab blob.
   d_1 dipakai karena satu-satunya driver fixture yang punya akun user. */
const BIG_KTP = 'data:image/jpeg;base64,' + 'E'.repeat(58000);
res = sync({
  drivers: { baseRev: revOf('drivers'), upserts: [Object.assign({}, readRec('drivers', 'd_1'), { ktpPhoto: BIG_KTP })], deletes: [] }
}, agenToken);
ok('sync foto KTP besar lewat jalur agen diterima', res.ok === true, res);
ok('foto KTP terbaca kembali identik', schemaValueEqual(readRec('drivers', 'd_1').ktpPhoto, BIG_KTP));

/* Field yang sudah dihapus dari skema ditolak server (bukan didiamkan). */
res = sync({
  drivers: { baseRev: revOf('drivers'), upserts: [Object.assign({}, readRec('drivers', 'd_2'), { selfie: 'data:image/png;base64,SELESAI' })], deletes: [] }
}, agenToken);
ok('upsert berbawa field selfie ditolak VALIDATION',
  res.ok === false && res.error.code === 'VALIDATION' && String(res.error.message || '').indexOf('selfie') >= 0, res);

/* Kondisi pra-migrasi: tab drivers dari deploy lama masih berisi kolom
   selfie (persis di posisi lama: x:ktpPhoto | selfie | x:photo) + dua
   baris chunk swafoto di driver_doc_blob. */
const drvMigSheet = spread.getSheetByName('drivers');
const drvMigHdr = drvMigSheet.rows[0];
const ktpPos = drvMigHdr.indexOf('ktpPhoto');
drvMigSheet.rows.forEach((row) => { row.splice(ktpPos + 1, 0, ''); });
drvMigHdr[ktpPos + 1] = 'selfie';
const d1MigRow = drvMigSheet.rows.find((r) => String(r[0]) === 'd_1');
d1MigRow[ktpPos + 1] = 'data:image/png;base64,SELESAI_LAMA';
const blobMigSheet = spread.getSheetByName('driver_doc_blob');
const blobMigHdr = blobMigSheet.rows[0];
const mkBlobRow = (parent, field, i, chunk) => blobMigHdr.map((h) =>
  h === 'parent_id' ? parent : h === 'field' ? field : h === 'i' ? String(i) : h === 'chunk' ? chunk : '');
blobMigSheet.rows.push(mkBlobRow('d_1', 'selfie', 1, 'SELFIE-A'));
blobMigSheet.rows.push(mkBlobRow('d_3', 'selfie', 1, 'SELFIE-B'));

const ensureSelfie = S.ensureSchema_();
ok('migrasi penghapusan kolom selfie terjalankan',
  ensureSelfie.ok === true && (ensureSelfie.fixes || []).some((f) => f.indexOf('kolom selfie dihapus') === 0), ensureSelfie);
ok('pesan migrasi menyebut pembersihan swafoto', (ensureSelfie.fixes || []).join('; ').indexOf('baris swafoto dibersihkan') >= 0, ensureSelfie.fixes);

const blobSelfieAfter = blobMigSheet.rows.slice(1).filter((row) =>
  row.some((cell) => String(cell == null ? '' : cell).trim() !== ''));
ok('chunk selfie dibersihkan, chunk foto lain utuh',
  blobSelfieAfter.every((row) => String(row[blobMigHdr.indexOf('field')] || '').trim() !== 'selfie') &&
  blobSelfieAfter.some((row) => String(row[blobMigHdr.indexOf('field')] || '').trim() === 'ktpPhoto'),
  blobSelfieAfter.length);
ok('kolom selfie hilang dari header drivers',
  spread.getSheetByName('drivers').rows[0].indexOf('selfie') === -1);
ok('data kolom tetangga tidak bergeser (ktpPhoto d_1 tetap BIG_KTP)',
  schemaValueEqual(readRec('drivers', 'd_1').ktpPhoto, BIG_KTP));

res = dispatch(bodyOf({}, { action: 'bootstrap', token: driverToken }));
ok('bootstrap driver tetap normal tanpa selfie',
  res.ok === true && (res.data.records.drivers || []).some((x) => String(x.id) === 'd_1') &&
  !Object.prototype.hasOwnProperty.call(readRec('drivers', 'd_1') || {}, 'selfie'),
  (res.data.records.drivers || []).map((x) => x.id));

const vdSelfie = S.validateDatabase();
ok('validateDatabase hijau setelah penghapusan selfie', vdSelfie.ok === true, vdSelfie.problems);

const ensureIdemSelfie = S.ensureSchema_();
ok('migrasi selfie idempoten (tidak menulis ulang)',
  ensureIdemSelfie.ok === true &&
  (ensureIdemSelfie.fixes || []).every((f) => f.indexOf('selfie') < 0 && f.indexOf('swafoto') < 0), ensureIdemSelfie.fixes);

console.log('\n== Ringkasan ==');
console.log('PASS: ' + passed + ', FAIL: ' + failed);
process.exit(failed === 0 ? 0 : 1);
