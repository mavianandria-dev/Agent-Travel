/**
 * code.gs — Backend API TransAceh di atas Google Sheets (boleh
 * membaca/menulis tab yang dibuat oleh seed.gs).
 *
 * Prinsip utama:
 *  1. Semua fungsi & konstanta diawali `api`/`API_` supaya tidak bentrok
 *     dengan fungsi seed.gs (kebetulan berbagi global di Apps Script).
 *  2. Mode default adalah "direct": browser memanggil Web App tanpa proxy.
 *     `proxyKey` hanya diwajibkan bila Script Property REQUIRE_PROXY_KEY=true.
 *  3. Token sesi disusun HMAC-SHA256 dari payload dan dikirim di body.
 *  4. Password tidak disimpan plaintext: dihash berlapis (salt + pepper +
 *     iterasi HMAC-SHA512). Versi legacy seed.gs diupgrade saat login.
 *  5. Penulisan data dilinungi LockService (LockService.getScriptLock) supaya
 *     tidak terjadi tabrakan antar request.
 *  6. Semua akses data di-delegasi ke peran: pelanggan, agen, pengemudi,
 *     superadmin. Bootstrap publik hanya memuat field yang aman untuk umum;
 *     agen/pengemudi/pelanggan hanya menerima baris miliknya sendiri.
 *     Tulis via `commit` untuk sekarang hanya superadmin; peran lain memakai
 *     aksi akun tervalidasi (register, changePassword, adminCreateUser, ...).
 *  7. Response selalu {ok:true, data} atau {ok:false, error:{code,message}}.
 *
 * Struktur data sama dengan seed.gs:
 *  - Tab `_meta`: kolom key|value.
 *  - Tab koleksi: kolom id|ord|json|updated_at, satu baris = satu record JSON.
 *
 * Aksi yang didukung (via doPost):
 *  - health            => { service, version, now, schemaVersion } (tanpa auth)
 *  - login             => { user, token, expiresAt }
 *  - register          => { user, token?, expiresAt?, pending? }
 *  - session           => { user }
 *  - bootstrap         => { user, role, records, revisions }
 *  - commit            => { touched, revisions }        (superadmin)
 *  - changePassword    => { user }
 *  - adminCreateUser   => { user }                      (superadmin)
 *  - adminSetPassword  => { user }                      (superadmin)
 *
 * "setupBackend()" dijalankan manual dari editor Apps Script (bukan via HTTP):
 * membuat secret dan menyimpannya ke Script Properties. Secret yang sama
 * tidak akan ditimpa bila sudah ada. Secret tidak pernah dicetak ke log.
 */

var API_VERSION = '1.1.0';
var API_SERVICE_NAME = 'transaceh-db';

var API_SCHEMA_VERSION = '1';
var API_META_HEADERS = ['key', 'value'];
var API_COLLECTION_HEADERS = ['id', 'ord', 'json', 'updated_at'];
var API_MAX_JSON_CHARS = 45000;
var API_LOCK_WAIT_MS = 20000;
var API_TOKEN_TTL_DEFAULT = 12 * 60 * 60; // detik
var API_MIN_PASSWORD_LENGTH = 8;
var API_PASSWORD_ITERATIONS = 2000;
var API_PASSWORD_ALGO = 'hmac-sha512-iter-v1';

/* Throttling berbasis CacheService (best effort; cache bisa kosong). */
var API_RATE_MAX_FAILURES = 5;
var API_RATE_WINDOW_SECONDS = 15 * 60;
var API_RATE_BLOCK_SECONDS = 15 * 60;
var API_REGISTER_MAX_PER_HOUR = 30;

/** Kunci koleksi harus sama persis dengan seed.gs. */
var API_COLLECTION_KEYS = [
  'users', 'agencies', 'routes', 'routeRequests', 'vehicles', 'drivers',
  'schedules', 'maintenanceRequests', 'bookings', 'payments', 'ledger',
  'vouchers', 'reviews', 'notifications', 'audit', 'banners', 'supportTickets',
  'settings', 'fees'
];

/**
 * Field yang boleh terlihat oleh publik. `null` berarti seluruh record boleh
 * keluar (tetap melewati penyaring field rahasia). Field sensitif seperti
 * `kyc`, NIK, bank, dokumen, dan data pemilik kendaraan tidak pernah masuk
 * daftar ini.
 */
var API_PUBLIC_FIELDS = {
  banners: null,
  routes: null,
  reviews: null,
  agencies: [
    'id', 'name', 'logo', 'photo', 'address', 'phone', 'wa', 'email',
    'rating', 'trips', 'status', 'serviceFee', 'feeType', 'feeValue',
    'refundPolicy', 'description'
  ],
  vehicles: [
    'id', 'agencyId', 'brand', 'model', 'year', 'color', 'plate', 'vtype',
    'vtypeOther', 'baggage', 'capacity', 'photo', 'facilities', 'status',
    'layout', 'inactiveSeats', 'mainRoute', 'origin', 'dest', 'services',
    'opSchedule'
  ],
  schedules: [
    'id', 'agencyId', 'routeId', 'vehicleId', 'date', 'time', 'price',
    'status', 'tripStatus', 'blockedSeats', 'createdAt',
    'maintenanceRequestId', 'maintenanceFrom', 'maintenanceUntil',
    'maintenanceStatus', 'maintenanceReason'
  ]
};

/** Field yang tidak pernah boleh keluar lewat response / commit. */
var API_SECRET_FIELDS = [
  'pass', 'passHash', 'passSalt', 'passIter', 'passAlgo',
  'password', 'passwordHash', 'passwordSalt', 'tokenVersion'
];

var API_PROP_REQUIRE_PROXY_KEY = 'REQUIRE_PROXY_KEY';
var API_PROP_PROXY_KEY = 'API_PROXY_KEY';
var API_PROP_TOKEN_SECRET = 'API_TOKEN_SECRET';
var API_PROP_PASSWORD_PEPPER = 'PASSWORD_PEPPER';
var API_PROP_TOKEN_TTL = 'TOKEN_TTL';

var API_DEFAULT_REFUND_POLICY = [
  { minH: 72, pct: 100 },
  { minH: 24, pct: 50 },
  { minH: 0, pct: 0 }
];

/* ------------------------------------------------------------------ */
/* Helper umum                                                         */
/* ------------------------------------------------------------------ */

function apiError_(code, message) {
  var err = new Error(message || code || 'ERROR');
  err.code = code || 'ERROR';
  return err;
}

function apiNowIso_() {
  return new Date().toISOString();
}

function apiNowSeconds_() {
  return Math.floor(Date.now() / 1000);
}

function apiParseJson_(text) {
  if (text == null) return null;
  try { return JSON.parse(text); } catch (err) { return null; }
}

/** Pembanding dengan pendekatan constant-time untuk hex/base64. */
function apiSafeEqual_(left, right) {
  var a = String(left == null ? '' : left);
  var b = String(right == null ? '' : right);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

function apiBytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    out += ('0' + ((bytes[i] & 0xff).toString(16))).slice(-2);
  }
  return out;
}

/**
 * Secret acak dalam hex. Utilities.getUuid() bukan CSPRNG penuh, tapi berasal
 * dari infrastruktur Google yang cukup untuk kasus internal ini dan jauh lebih
 * aman daripada Math.random.
 */
function apiSecretHex_(bytes) {
  var out = '';
  while (out.length < bytes * 2) {
    out += String(Utilities.getUuid()).replace(/-/g, '');
  }
  return out.slice(0, bytes * 2);
}

function apiB64Url_(value) {
  return String(Utilities.base64EncodeWebSafe(value)).replace(/=+$/, '');
}

function apiB64UrlDecode_(value) {
  var text = String(value == null ? '' : value).replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4 !== 0) text += '=';
  var bytes = Utilities.base64Decode(text);
  return Utilities.newBlob(bytes).getDataAsString();
}

function apiSleep_(ms) {
  try {
    if (Utilities && typeof Utilities.sleep === 'function') Utilities.sleep(ms);
  } catch (err) { /* abaikan: hanya memperlambat brute force */ }
}

/* ------------------------------------------------------------------ */
/* Secret / Script Properties                                          */
/* ------------------------------------------------------------------ */

function apiConfig_() {
  var props = PropertiesService.getScriptProperties();
  var requireProxy = String(props.getProperty(API_PROP_REQUIRE_PROXY_KEY) || 'false').toLowerCase() === 'true';
  var proxy = props.getProperty(API_PROP_PROXY_KEY) || '';
  var token = props.getProperty(API_PROP_TOKEN_SECRET) || '';
  var pepper = props.getProperty(API_PROP_PASSWORD_PEPPER) || '';
  var ttlRaw = props.getProperty(API_PROP_TOKEN_TTL);
  var ttl = Number(ttlRaw || API_TOKEN_TTL_DEFAULT);
  if (isNaN(ttl) || ttl <= 0) ttl = API_TOKEN_TTL_DEFAULT;
  if (!token || !pepper || (requireProxy && !proxy)) {
    throw apiError_('SETUP_REQUIRED', 'Secret backend belum diatur. Jalankan setupBackend() di editor Apps Script.');
  }
  return {
    proxy: proxy,
    token: token,
    pepper: pepper,
    ttl: ttl,
    requireProxy: requireProxy
  };
}

/**
 * Dijalankan manual sekali dari editor Apps Script. Secret yang sudah ada
 * tidak ditimpa (rotasi harus dilakukan dengan sengaja). Mode direct adalah
 * default; apiProxyKey tetap dibuat agar bisa diaktifkan lagi lewat
 * REQUIRE_PROXY_KEY=true.
 */
function setupBackend() {
  var props = PropertiesService.getScriptProperties();
  if (!props) throw new Error('Script Properties tidak tersedia.');
  if (!props.getProperty(API_PROP_REQUIRE_PROXY_KEY)) {
    props.setProperty(API_PROP_REQUIRE_PROXY_KEY, 'false');
  }
  if (!props.getProperty(API_PROP_PROXY_KEY)) {
    props.setProperty(API_PROP_PROXY_KEY, apiSecretHex_(32));
  }
  if (!props.getProperty(API_PROP_TOKEN_SECRET)) {
    props.setProperty(API_PROP_TOKEN_SECRET, apiSecretHex_(32));
  }
  if (!props.getProperty(API_PROP_PASSWORD_PEPPER)) {
    props.setProperty(API_PROP_PASSWORD_PEPPER, apiSecretHex_(32));
  }
  if (!props.getProperty(API_PROP_TOKEN_TTL)) {
    props.setProperty(API_PROP_TOKEN_TTL, String(API_TOKEN_TTL_DEFAULT));
  }
  Logger.log('[TransAceh API] setupBackend selesai. Mode direct (proxyKey opsional). Secret tidak dicetak.');
  return 'Setup backend selesai.';
}

/* ------------------------------------------------------------------ */
/* Throttling (CacheService)                                           */
/* ------------------------------------------------------------------ */

function apiCache_() {
  try {
    if (typeof CacheService === 'undefined' || !CacheService) return null;
    return CacheService.getScriptCache();
  } catch (err) {
    return null;
  }
}

/** Kunci cache tidak memuat email mentah (dihash lebih dulu). */
function apiRateKey_(scope, ident) {
  var digest = '';
  try {
    digest = apiBytesToHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(ident == null ? '' : ident),
      Utilities.Charset.UTF_8
    )).slice(0, 32);
  } catch (err) {
    digest = 'fallback';
  }
  return 'rl:' + String(scope || 'x') + ':' + digest;
}

function apiRateState_(cache, key) {
  var parsed = apiParseJson_(cache.get(key));
  if (!parsed || typeof parsed !== 'object') return { n: 0, t: 0, b: 0 };
  return {
    n: Number(parsed.n) || 0,
    t: Number(parsed.t) || 0,
    b: Number(parsed.b) || 0
  };
}

/** Lempar RATE_LIMITED bila identifier sedang diblokir. */
function apiRateGuard_(key) {
  var cache = apiCache_();
  if (!cache) return;
  var state = apiRateState_(cache, key);
  var now = apiNowSeconds_();
  if (state.b && state.b > now) {
    var mins = Math.max(1, Math.ceil((state.b - now) / 60));
    throw apiError_('RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi dalam ' + mins + ' menit.');
  }
}

/** Catat satu kegagalan; blokir setelah batas tercapai. */
function apiRateFail_(key) {
  var cache = apiCache_();
  if (!cache) return;
  var state = apiRateState_(cache, key);
  var now = apiNowSeconds_();
  if (!state.t || now - state.t > API_RATE_WINDOW_SECONDS) {
    state = { n: 0, t: now, b: 0 };
  }
  state.n += 1;
  if (state.n >= API_RATE_MAX_FAILURES) state.b = now + API_RATE_BLOCK_SECONDS;
  cache.put(key, JSON.stringify(state), API_RATE_WINDOW_SECONDS + API_RATE_BLOCK_SECONDS + 60);
}

function apiRateClear_(key) {
  var cache = apiCache_();
  if (!cache) return;
  try { cache.remove(key); } catch (err) { /* abaikan */ }
}

/**
 * Penghitung jendela tetap (mis. pembatasan jumlah pendaftaran per jam).
 * Melempar RATE_LIMITED bila kuota jendela habis.
 */
function apiRateCounter_(key, limit, windowSeconds, blockSeconds) {
  var cache = apiCache_();
  if (!cache) return;
  var state = apiRateState_(cache, key);
  var now = apiNowSeconds_();
  if (state.b && state.b > now) {
    var mins = Math.max(1, Math.ceil((state.b - now) / 60));
    throw apiError_('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi dalam ' + mins + ' menit.');
  }
  if (!state.t || now - state.t > windowSeconds) state = { n: 0, t: now, b: 0 };
  state.n += 1;
  if (state.n > limit) state.b = now + blockSeconds;
  cache.put(key, JSON.stringify(state), windowSeconds + blockSeconds + 60);
  if (state.n > limit) {
    throw apiError_('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi nanti.');
  }
}

/* ------------------------------------------------------------------ */
/* Password hashing (HMAC-SHA512 berulang)                             */
/* ------------------------------------------------------------------ */

function apiPasswordDigest_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_512,
    String(value),
    Utilities.Charset.UTF_8
  );
  return apiBytesToHex_(bytes);
}

/**
 * Password hash: HMAC-SHA512 berulang dengan salt acak + pepper.
 * Deterministik; hasil 128 hex char (memakai SHA-512).
 */
function apiPasswordHash_(password, salt, iterations, pepper) {
  var key = 'transaceh-pw-v1:' + String(pepper || '') + ':' + String(password);
  var iter = Math.max(1, Number(iterations || API_PASSWORD_ITERATIONS));
  var prev = apiPasswordDigest_('pw:' + String(salt || '') + ':' + key);
  for (var i = 1; i < iter; i++) prev = apiPasswordDigest_(prev + ':' + key);
  return prev;
}

function apiPasswordVerify_(password, hash, salt, iterations, pepper) {
  if (!hash) return false;
  var iter = Number(iterations || API_PASSWORD_ITERATIONS);
  if (isNaN(iter) || iter < 1) iter = API_PASSWORD_ITERATIONS;
  return apiSafeEqual_(apiPasswordHash_(password, salt, iter, pepper), String(hash));
}

function apiHashForUser_(user, password, cfg) {
  var salt = apiSecretHex_(16);
  user.passHash = apiPasswordHash_(password, salt, API_PASSWORD_ITERATIONS, cfg.pepper);
  user.passSalt = salt;
  user.passIter = API_PASSWORD_ITERATIONS;
  user.passAlgo = API_PASSWORD_ALGO;
  delete user.pass;
  return user;
}

/* ------------------------------------------------------------------ */
/* Token sesi                                                          */
/* ------------------------------------------------------------------ */

function apiIssueToken_(user, cfg) {
  var now = apiNowSeconds_();
  var payload = {
    sub: String(user.id),
    role: String(user.role || ''),
    agencyId: String(user.agencyId || ''),
    pv: Number(user.tokenVersion || 0) || 0,
    iat: now,
    exp: now + cfg.ttl
  };
  var bodyB64 = apiB64Url_(JSON.stringify(payload));
  var sigB64 = apiB64Url_(Utilities.computeHmacSha256Signature(bodyB64, cfg.token));
  return { token: bodyB64 + '.' + sigB64, exp: payload.exp };
}

function apiTokenVerify_(token, secret) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  var expectedSig = apiB64Url_(Utilities.computeHmacSha256Signature(parts[0], String(secret || '')));
  if (!apiSafeEqual_(expectedSig, parts[1])) return null;
  var json = apiParseJson_(apiB64UrlDecode_(parts[0]));
  if (!json || typeof json !== 'object' || !json.sub) return null;
  if (Number(json.exp || 0) <= apiNowSeconds_()) return null;
  return json;
}

/* ------------------------------------------------------------------ */
/* Parsing request                                                     */
/* ------------------------------------------------------------------ */

function apiParseRequest_(e) {
  var body = {};
  var params = {};
  if (e && e.parameter) params = e.parameter;
  if (e && e.postData && e.postData.contents != null &&
      String(e.postData.contents).trim() !== '') {
    var parsed = apiParseJson_(e.postData.contents);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw apiError_('VALIDATION', 'Body harus JSON objek.');
    }
    body = parsed;
  }
  return {
    action: String(body.action || params.action || '').trim().toLowerCase(),
    body: body,
    params: params,
    proxyKey: String(body.proxyKey || params.proxyKey || '').trim(),
    token: String(body.token || params.token || '').trim()
  };
}

/* ------------------------------------------------------------------ */
/* Google Sheets I/O                                                   */
/* ------------------------------------------------------------------ */

function apiSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw apiError_('SPREADSHEET_UNAVAILABLE', 'Spreadsheet aktif tidak ditemukan.');
  return ss;
}

function apiSheet_(ss, key) {
  var sheet = ss.getSheetByName(key);
  if (!sheet) throw apiError_('SHEET_NOT_FOUND', 'Tab ' + key + ' tidak ditemukan.');
  return sheet;
}

function apiReadCollection_(ss, key) {
  var sheet = apiSheet_(ss, key);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, API_COLLECTION_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var json = String(rows[i][2] == null ? '' : rows[i][2]);
    if (!String(json).trim()) continue;
    var rec = apiParseJson_(json);
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      throw apiError_('DATA_CORRUPT', 'JSON tidak valid pada ' + key + ' baris ' + (i + 2) + '.');
    }
    out.push(rec);
  }
  return out;
}

function apiWriteCollection_(ss, key, records) {
  var sheet = apiSheet_(ss, key);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, API_COLLECTION_HEADERS.length).clearContent();
  if (!records || !records.length) return 0;
  var now = apiNowIso_();
  var rows = [];
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var id = apiRecordId_(rec);
    if (!id) {
      throw apiError_('VALIDATION', 'Record pada ' + key + ' indeks ' + i + ' tidak punya id.');
    }
    var json = JSON.stringify(rec);
    if (json.length > API_MAX_JSON_CHARS) {
      throw apiError_('VALIDATION', 'Record ' + id + ' pada ' + key + ' melebihi ' + API_MAX_JSON_CHARS + ' karakter.');
    }
    rows.push([id, i + 1, json, now]);
  }
  sheet.getRange(2, 1, rows.length, API_COLLECTION_HEADERS.length).setValues(rows);
  return rows.length;
}

function apiReadMeta_(ss) {
  var sheet = apiSheet_(ss, '_meta');
  var lastRow = sheet.getLastRow();
  var out = {};
  if (lastRow < 2) return out;
  var rows = sheet.getRange(2, 1, lastRow - 1, API_META_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][0] == null ? '' : rows[i][0]).trim();
    if (key) out[key] = String(rows[i][1] == null ? '' : rows[i][1]);
  }
  return out;
}

/**
 * Perbarui pasangan key/value di _meta tanpa menghapus entry lain. Entry
 * baru ditambahkan di akhir; entry sudah ada ditimpa dengan nilai baru.
 */
function apiUpdateMeta_(ss, updates) {
  var sheet = apiSheet_(ss, '_meta');
  var lastRow = sheet.getLastRow();
  var rows = [];
  var index = {};
  if (lastRow > 1) {
    var current = sheet.getRange(2, 1, lastRow - 1, API_META_HEADERS.length).getValues();
    for (var i = 0; i < current.length; i++) {
      var key = String(current[i][0] == null ? '' : current[i][0]).trim();
      var value = String(current[i][1] == null ? '' : current[i][1]);
      rows.push([key, value]);
      index[key] = rows.length - 1;
    }
  }
  var keys = Object.keys(updates || {});
  for (var u = 0; u < keys.length; u++) {
    var k = keys[u];
    var v = String(updates[k]);
    if (index[k] == null) {
      rows.push([k, v]);
      index[k] = rows.length - 1;
    } else {
      rows[index[k]][1] = v;
    }
  }
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, API_META_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, API_META_HEADERS.length).setValues(rows);
  return rows.length;
}

/** Naikkan rev koleksi di objek meta (belum menulis sheet). */
function apiBumpRev_(meta, key) {
  var next = (Number(meta['rev.' + key] || 0) || 0) + 1;
  meta['rev.' + key] = String(next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Record helper                                                       */
/* ------------------------------------------------------------------ */

function apiRecordId_(record) {
  if (!record || typeof record !== 'object') return '';
  if (record.id != null && record.id !== '') return String(record.id);
  if (record.key != null && record.key !== '') return String(record.key);
  if (record._id != null && record._id !== '') return String(record._id);
  return '';
}

function apiStripSecrets_(record) {
  var clean = JSON.parse(JSON.stringify(record));
  for (var i = 0; i < API_SECRET_FIELDS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(clean, API_SECRET_FIELDS[i])) {
      delete clean[API_SECRET_FIELDS[i]];
    }
  }
  return clean;
}

function apiSanitizeRecord_(record) {
  if (!record || typeof record !== 'object') return null;
  return apiStripSecrets_(record);
}

function apiSanitizeRecords_(records) {
  if (!Array.isArray(records)) return [];
  return records.map(apiSanitizeRecord_).filter(Boolean);
}

function apiValidateUpsertList_(key, target) {
  var upserts = Array.isArray(target.upserts) ? target.upserts : [];
  var seen = {};
  for (var i = 0; i < upserts.length; i++) {
    var rec = upserts[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      throw apiError_('VALIDATION', 'Record pada ' + key + ' harus objek.');
    }
    var id = apiRecordId_(rec);
    if (!id) throw apiError_('VALIDATION', 'Record di ' + key + ' tidak punya id.');
    if (seen[id]) throw apiError_('VALIDATION', 'Id duplikat di ' + key + ': ' + id);
    seen[id] = true;
    for (var f = 0; f < API_SECRET_FIELDS.length; f++) {
      var field = API_SECRET_FIELDS[f];
      if (Object.prototype.hasOwnProperty.call(rec, field)) {
        throw apiError_('VALIDATION', 'Field rahasia "' + field + '" tidak boleh lewat commit.');
      }
    }
    var json = JSON.stringify(rec);
    if (json.length > API_MAX_JSON_CHARS) {
      throw apiError_('VALIDATION', 'Record ' + id + ' pada ' + key + ' melebihi batas ' + API_MAX_JSON_CHARS + ' karakter.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Projection / filter helper                                          */
/* ------------------------------------------------------------------ */

function apiNormalizeEmail_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function apiIsEmail_(value) {
  return /.+@.+\..+/.test(String(value || ''));
}

function apiPhoneDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function apiNewId_(prefix, existingIds) {
  var existing = existingIds || {};
  for (var attempt = 0; attempt < 10; attempt++) {
    var id = String(prefix || 'ID') + '-' + apiSecretHex_(6).toUpperCase();
    if (!existing[id]) return id;
  }
  throw apiError_('INTERNAL', 'Gagal membuat id unik.');
}

function apiPickFields_(record, fields) {
  var out = {};
  if (!record || typeof record !== 'object') return out;
  var list = Array.isArray(fields) ? fields : [];
  for (var i = 0; i < list.length; i++) {
    var field = list[i];
    if (Object.prototype.hasOwnProperty.call(record, field)) out[field] = record[field];
  }
  return out;
}

function apiAgencyIsPublic_(agency) {
  if (!agency || typeof agency !== 'object') return false;
  var status = String(agency.status || 'active').trim().toLowerCase();
  return status === 'active';
}

/** Indeks record berdasarkan id/key (dipakai proyeksi jadwal). */
function apiIndexById_(records) {
  var map = {};
  (Array.isArray(records) ? records : []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    if (id) map[id] = rec;
  });
  return map;
}

function apiIdSet_(records) {
  var set = {};
  (Array.isArray(records) ? records : []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    if (id) set[id] = true;
  });
  return set;
}

function apiActorMatches_(log, email) {
  var needle = apiNormalizeEmail_(email);
  if (!needle) return false;
  return String((log && log.actor) || '').toLowerCase().indexOf(needle) >= 0;
}

/**
 * Peta kursi terpakai per jadwal: booking paid/done/pending + blockedSeats +
 * kursi nonaktif kendaraan. Frontend publik hanya menerima daftar kursi,
 * bukan record booking (yang berisi data penumpang).
 */
function apiTakenSeatsMap_(bookings, vehiclesById, schedules) {
  var bySchedule = {};
  (Array.isArray(bookings) ? bookings : []).forEach(function (booking) {
    var status = String((booking && booking.status) || '');
    if (status !== 'paid' && status !== 'done' && status !== 'pending') return;
    var sid = String((booking && booking.scheduleId) || '');
    if (!sid) return;
    var set = bySchedule[sid] || (bySchedule[sid] = {});
    var seats = (booking && Array.isArray(booking.seats)) ? booking.seats : [];
    seats.forEach(function (seat) {
      if (seat != null && seat !== '') set[String(seat)] = true;
    });
  });
  var out = {};
  (Array.isArray(schedules) ? schedules : []).forEach(function (schedule) {
    var sid = String((schedule && schedule.id) || '');
    var set = {};
    var base = bySchedule[sid] || {};
    Object.keys(base).forEach(function (seat) { set[seat] = true; });
    var blocked = (schedule && Array.isArray(schedule.blockedSeats)) ? schedule.blockedSeats : [];
    blocked.forEach(function (seat) { if (seat != null && seat !== '') set[String(seat)] = true; });
    var vehicle = vehiclesById[String((schedule && schedule.vehicleId) || '')];
    var inactive = (vehicle && Array.isArray(vehicle.inactiveSeats)) ? vehicle.inactiveSeats : [];
    inactive.forEach(function (seat) { if (seat != null && seat !== '') set[String(seat)] = true; });
    out[sid] = Object.keys(set).sort();
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* User / role helper                                                  */
/* ------------------------------------------------------------------ */

function apiFindUser_(ss, userId) {
  var users = apiReadCollection_(ss, 'users');
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].id) === String(userId)) return users[i];
  }
  return null;
}

function apiAuthedUser_(req, cfg) {
  var payload = apiTokenVerify_(req.token, cfg.token);
  if (!payload) throw apiError_('UNAUTHORIZED', 'Token tidak valid atau kedaluwarsa.');
  var user = apiFindUser_(apiSpreadsheet_(), payload.sub);
  if (!user) throw apiError_('UNAUTHORIZED', 'User tidak ditemukan.');
  if (Number(payload.pv || 0) !== Number(user.tokenVersion || 0)) {
    throw apiError_('UNAUTHORIZED', 'Sesi sudah tidak berlaku. Silakan masuk lagi.');
  }
  if (String(user.status || 'active') !== 'active') {
    throw apiError_('ACCOUNT_BLOCKED', 'Akun tidak aktif.');
  }
  return user;
}

function apiRequireRole_(user, roles) {
  var role = String((user && user.role) || '');
  if (!roles || roles.indexOf(role) < 0) {
    throw apiError_('FORBIDDEN', 'Aksi ini tidak diizinkan untuk peran Anda.');
  }
  return user;
}

function apiTodayKey_() {
  return new Date().toISOString().slice(0, 10);
}

/** Ada jadwal aktif (hari ini/later) yang memakai driver tsb? */
function apiDriverHasActiveSchedule_(schedules, driverId) {
  var today = apiTodayKey_();
  var id = String(driverId || '');
  if (!id) return false;
  for (var i = 0; i < schedules.length; i++) {
    var s = schedules[i] || {};
    if (String(s.driverId || '') !== id && String(s.backupDriverId || '') !== id) continue;
    if (String(s.status || 'open') !== 'open') continue;
    if (String(s.tripStatus || 'scheduled') === 'cancelled') continue;
    if (String(s.date || '') >= today) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Endpoint                                                            */
/* ------------------------------------------------------------------ */

function doGet(e) {
  // Health endpoint publik; tidak menyentuh secret.
  var response = { ok: true, data: apiHealthData_() };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var output = null;
  try {
    var req = apiParseRequest_(e);
    output = apiDispatch_(req);
  } catch (err) {
    var code = (err && err.code) ? err.code : 'INTERNAL';
    Logger.log('[TransAceh API] error ' + code + ': ' +
      ((err && (err.stack || err.message)) || String(err)));
    output = {
      ok: false,
      error: {
        code: code,
        message: (err && err.message) || 'Terjadi kesalahan pada server.'
      }
    };
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiHealthData_() {
  return {
    service: API_SERVICE_NAME,
    version: API_VERSION,
    schemaVersion: API_SCHEMA_VERSION,
    now: apiNowIso_()
  };
}

function apiDispatch_(req) {
  if (!req.action) throw apiError_('VALIDATION', 'Aksi wajib diisi.');
  req.action = String(req.action).trim().toLowerCase();
  if (req.action === 'health') {
    return { ok: true, data: apiHealthData_() };
  }
  var cfg = apiConfig_();
  if (cfg.requireProxy) {
    if (!req.proxyKey || !apiSafeEqual_(req.proxyKey, cfg.proxy)) {
      throw apiError_('PROXY_FORBIDDEN', 'Proxy key wajib diisi dan harus valid.');
    }
  } else if (req.proxyKey && !apiSafeEqual_(req.proxyKey, cfg.proxy)) {
    // Mode direct mengizinkan proxyKey kosong, tetapi nilai yang dikirim
    // tetap harus benar (mencegah salah konfigurasi yang membingungkan).
    throw apiError_('PROXY_FORBIDDEN', 'Proxy key tidak valid.');
  }
  switch (req.action) {
    case 'login': return apiLogin_(req, cfg);
    case 'register': return apiRegister_(req, cfg);
    case 'session': return apiSession_(req, cfg);
    case 'bootstrap': return apiBootstrap_(req, cfg);
    case 'commit': return apiCommit_(req, cfg);
    case 'changepassword': return apiChangePassword_(req, cfg);
    case 'admincreateuser': return apiAdminCreateUser_(req, cfg);
    case 'adminsetpassword': return apiAdminSetPassword_(req, cfg);
    default:
      throw apiError_('UNSUPPORTED_ACTION', 'Aksi tidak dikenal: ' + req.action);
  }
}

/* ------------------------------------------------------------------ */
/* Action: login                                                       */
/* ------------------------------------------------------------------ */

function apiLogin_(req, cfg) {
  var body = req.body || {};
  var email = apiNormalizeEmail_(body.email);
  var password = String(body.password || '');
  if (!email || !password) {
    throw apiError_('VALIDATION', 'Email dan password wajib diisi.');
  }
  var rateKey = apiRateKey_('login', email);
  apiRateGuard_(rateKey);

  var user = null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var users = apiReadCollection_(ss, 'users');
    for (var i = 0; i < users.length; i++) {
      if (apiNormalizeEmail_(users[i].email) === email) {
        user = users[i];
        break;
      }
    }
    if (!user) {
      apiRateFail_(rateKey);
      apiSleep_(250);
      throw apiError_('UNAUTHORIZED', 'Email atau password salah.');
    }
    if (String(user.status || 'active') !== 'active') {
      throw apiError_('ACCOUNT_BLOCKED', 'Akun tidak aktif.');
    }
    var verified = false;
    var migrated = false;
    if (user.passHash) {
      verified = apiPasswordVerify_(
        password,
        String(user.passHash),
        String(user.passSalt || ''),
        Number(user.passIter || API_PASSWORD_ITERATIONS),
        cfg.pepper
      );
    } else if (user.pass) {
      // Legacy dari seed.gs: password masih plaintext. Upgrade ke hash.
      verified = apiSafeEqual_(String(user.pass), password);
      if (verified) {
        apiHashForUser_(user, password, cfg);
        migrated = true;
      }
    }
    if (!verified) {
      apiRateFail_(rateKey);
      apiSleep_(250);
      throw apiError_('UNAUTHORIZED', 'Email atau password salah.');
    }
    if (migrated) {
      var meta = apiReadMeta_(ss);
      apiWriteCollection_(ss, 'users', users);
      apiBumpRev_(meta, 'users');
      apiUpdateMeta_(ss, meta);
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }
  apiRateClear_(rateKey);
  var issued = apiIssueToken_(user, cfg);
  return {
    ok: true,
    data: {
      user: apiSanitizeRecord_(user),
      token: issued.token,
      expiresAt: issued.exp
    }
  };
}

/* ------------------------------------------------------------------ */
/* Action: register (publik)                                           */
/* ------------------------------------------------------------------ */

function apiRegister_(req, cfg) {
  apiRateCounter_(apiRateKey_('register', 'global'), API_REGISTER_MAX_PER_HOUR, 3600, 3600);

  var body = req.body || {};
  var name = String(body.name || '').trim();
  var email = apiNormalizeEmail_(body.email);
  var phone = String(body.phone || '').trim();
  var password = String(body.password || '');
  var role = String(body.role || 'pelanggan').trim().toLowerCase();
  var agencyName = String(body.agencyName || '').trim();
  var agencyAddress = String(body.agencyAddress || '').trim();

  if (!name) throw apiError_('VALIDATION', 'Nama lengkap wajib diisi.');
  if (!apiIsEmail_(email)) throw apiError_('VALIDATION', 'Format email belum benar.');
  if (!phone || apiPhoneDigits_(phone).length < 9) {
    throw apiError_('VALIDATION', 'No HP minimal 9 digit angka.');
  }
  if (password.length < API_MIN_PASSWORD_LENGTH) {
    throw apiError_('VALIDATION', 'Password minimal ' + API_MIN_PASSWORD_LENGTH + ' karakter.');
  }
  if (role !== 'pelanggan' && role !== 'agen') {
    throw apiError_('VALIDATION', 'Pendaftaran hanya untuk pelanggan atau agen.');
  }
  if (role === 'agen') {
    if (agencyName.length < 2) throw apiError_('VALIDATION', 'Nama travel wajib diisi.');
    if (agencyAddress.length < 2) throw apiError_('VALIDATION', 'Alamat travel wajib diisi.');
  }

  var user = null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var users = apiReadCollection_(ss, 'users');
    for (var i = 0; i < users.length; i++) {
      if (apiNormalizeEmail_(users[i].email) === email) {
        throw apiError_('VALIDATION', 'Email sudah terdaftar.');
      }
    }
    var userIds = {};
    users.forEach(function (u) { if (u && u.id) userIds[String(u.id)] = true; });
    var meta = apiReadMeta_(ss);
    var agencyId = null;

    if (role === 'agen') {
      var agencies = apiReadCollection_(ss, 'agencies');
      var agencyIds = {};
      agencies.forEach(function (a) { if (a && a.id) agencyIds[String(a.id)] = true; });
      agencyId = apiNewId_('AG', agencyIds);
      agencies.push({
        id: agencyId,
        name: agencyName,
        logo: '',
        address: agencyAddress,
        phone: phone || '-',
        bank: '-',
        status: 'pending',
        feeType: 'percent',
        feeValue: 8,
        refundPolicy: JSON.parse(JSON.stringify(API_DEFAULT_REFUND_POLICY)),
        rating: 5.0,
        trips: 0
      });
      apiWriteCollection_(ss, 'agencies', agencies);
      apiBumpRev_(meta, 'agencies');
    }

    user = {
      id: apiNewId_('U', userIds),
      name: name,
      email: email,
      phone: phone,
      wa: phone,
      role: role,
      agencyId: agencyId,
      status: role === 'agen' ? 'pending' : 'active',
      photo: ''
    };
    if (role === 'pelanggan') user.favorites = [];
    apiHashForUser_(user, password, cfg);
    users.push(user);
    apiWriteCollection_(ss, 'users', users);
    apiBumpRev_(meta, 'users');
    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  var data = { user: apiSanitizeRecord_(user), pending: role === 'agen' };
  if (role === 'pelanggan') {
    var issued = apiIssueToken_(user, cfg);
    data.token = issued.token;
    data.expiresAt = issued.exp;
  }
  return { ok: true, data: data };
}

/* ------------------------------------------------------------------ */
/* Action: session                                                     */
/* ------------------------------------------------------------------ */

function apiSession_(req, cfg) {
  var user = apiAuthedUser_(req, cfg);
  return { ok: true, data: { user: apiSanitizeRecord_(user) } };
}

/* ------------------------------------------------------------------ */
/* Action: bootstrap                                                   */
/* ------------------------------------------------------------------ */

function apiBootstrap_(req, cfg) {
  var tokenPayload = req.token ? apiTokenVerify_(req.token, cfg.token) : null;
  if (req.token && !tokenPayload) {
    throw apiError_('UNAUTHORIZED', 'Token tidak valid atau kedaluwarsa.');
  }
  var user = null;
  if (tokenPayload) {
    user = apiFindUser_(apiSpreadsheet_(), tokenPayload.sub);
    if (!user) throw apiError_('UNAUTHORIZED', 'User tidak ditemukan.');
    if (Number(tokenPayload.pv || 0) !== Number(user.tokenVersion || 0)) {
      throw apiError_('UNAUTHORIZED', 'Sesi sudah tidak berlaku. Silakan masuk lagi.');
    }
    if (String(user.status || 'active') !== 'active') {
      throw apiError_('ACCOUNT_BLOCKED', 'Akun tidak aktif.');
    }
  }
  var role = user ? String(user.role || '') : 'publik';
  if (['publik', 'pelanggan', 'agen', 'pengemudi', 'superadmin'].indexOf(role) < 0) {
    throw apiError_('FORBIDDEN', 'Role tidak dikenal: ' + role);
  }
  var ss = apiSpreadsheet_();
  var meta = apiReadMeta_(ss);
  var scoped = apiBootstrapData_(ss, meta, role, user);
  return {
    ok: true,
    data: {
      user: user ? apiSanitizeRecord_(user) : null,
      role: role,
      records: scoped.records,
      revisions: scoped.revisions
    }
  };
}

/**
 * Susun data bootstrap sesuai peran:
 *  - publik    : katalog publik terproyeksi (tanpa KYC/NIK/data pemilik).
 *  - pelanggan : katalog + booking/payment/notifikasi/tiket miliknya.
 *  - pengemudi : jadwal, kendaraan, dan booking yang ditugaskan kepadanya.
 *  - agen      : data agensinya penuh; agensi lain hanya field publik.
 *  - superadmin: semua koleksi penuh.
 */
function apiBootstrapData_(ss, meta, role, user) {
  var records = {};
  var revisions = {};
  var cache = {};

  function read(key) {
    if (!Object.prototype.hasOwnProperty.call(cache, key)) {
      cache[key] = apiReadCollection_(ss, key);
    }
    return cache[key];
  }
  function rev(key) {
    return Number(meta['rev.' + key] || 0) || 0;
  }
  function put(key, list) {
    records[key] = apiSanitizeRecords_(list || []);
    revisions[key] = rev(key);
  }
  function putProjected(key, list) {
    var fields = API_PUBLIC_FIELDS[key];
    var out = (list || []).map(function (rec) {
      return fields ? apiPickFields_(rec, fields) : apiStripSecrets_(rec);
    });
    put(key, out);
  }

  if (role === 'superadmin') {
    for (var s = 0; s < API_COLLECTION_KEYS.length; s++) {
      var superKey = API_COLLECTION_KEYS[s];
      put(superKey, read(superKey));
    }
    return { records: records, revisions: revisions };
  }

  var agencies = read('agencies');
  var vehicles = read('vehicles');
  var schedules = read('schedules');
  var bookings = read('bookings');
  var vehicleById = apiIndexById_(vehicles);
  var publicAgencies = agencies.filter(apiAgencyIsPublic_);
  var publicAgencyIds = apiIdSet_(publicAgencies);
  var takenSeats = apiTakenSeatsMap_(bookings, vehicleById, schedules);

  function projectSchedule(rec) {
    var out = apiPickFields_(rec, API_PUBLIC_FIELDS.schedules);
    out.takenSeats = takenSeats[String((rec && rec.id) || '')] || [];
    return out;
  }
  function publicSchedules(list) {
    return (list || []).filter(function (s) {
      return publicAgencyIds[String((s && s.agencyId) || '')];
    }).map(projectSchedule);
  }
  function publicVehicles(list) {
    return (list || []).filter(function (v) {
      return publicAgencyIds[String((v && v.agencyId) || '')];
    });
  }
  function publicReviews() {
    return read('reviews').filter(function (review) {
      var agencyId = String((review && review.agencyId) || '');
      return !agencyId || !!publicAgencyIds[agencyId];
    });
  }

  if (role === 'publik') {
    putProjected('banners', read('banners'));
    put('routes', read('routes'));
    putProjected('reviews', publicReviews());
    putProjected('agencies', publicAgencies);
    putProjected('vehicles', publicVehicles(vehicles));
    put('schedules', publicSchedules(schedules));
    return { records: records, revisions: revisions };
  }

  var email = apiNormalizeEmail_(user && user.email);
  var userId = String((user && user.id) || '');

  if (role === 'pelanggan') {
    var ownBookings = bookings.filter(function (b) {
      return apiNormalizeEmail_(b && b.userEmail) === email;
    });
    var ownBookingIds = apiIdSet_(ownBookings);

    putProjected('banners', read('banners'));
    put('routes', read('routes'));
    putProjected('reviews', publicReviews());
    putProjected('agencies', publicAgencies);
    putProjected('vehicles', publicVehicles(vehicles));
    put('schedules', publicSchedules(schedules));
    put('settings', read('settings'));
    put('bookings', ownBookings);
    put('payments', read('payments').filter(function (p) {
      return ownBookingIds[String((p && p.bookingId) || '')];
    }));
    put('vouchers', read('vouchers'));
    put('notifications', read('notifications').filter(function (n) {
      var to = apiNormalizeEmail_(n && n.to);
      return to === email || to === 'all';
    }));
    put('supportTickets', read('supportTickets').filter(function (t) {
      return apiNormalizeEmail_(t && t.userEmail) === email ||
        String((t && t.userId) || '') === userId;
    }));
    put('users', read('users').filter(function (u) {
      return String((u && u.id) || '') === userId;
    }));
    put('audit', read('audit').filter(function (log) {
      return apiActorMatches_(log, email);
    }));
    return { records: records, revisions: revisions };
  }

  if (role === 'pengemudi') {
    var drivers = read('drivers');
    var ownDriver = null;
    for (var d = 0; d < drivers.length; d++) {
      if (apiNormalizeEmail_(drivers[d].userEmail) === email) { ownDriver = drivers[d]; break; }
    }
    var driverId = String((ownDriver && ownDriver.id) || '');
    var driverSchedules = schedules.filter(function (s) {
      return driverId && (String(s.driverId || '') === driverId ||
        String(s.backupDriverId || '') === driverId);
    });
    var driverScheduleIds = apiIdSet_(driverSchedules);
    var driverVehicleIds = {};
    driverSchedules.forEach(function (s) {
      if (s && s.vehicleId) driverVehicleIds[String(s.vehicleId)] = true;
    });
    var assignedDriverIds = {};
    driverSchedules.forEach(function (s) {
      if (s && s.driverId) assignedDriverIds[String(s.driverId)] = true;
      if (s && s.backupDriverId) assignedDriverIds[String(s.backupDriverId)] = true;
    });
    var driverRecords = [];
    drivers.forEach(function (driverRec) {
      if (!driverRec) return;
      var recId = String(driverRec.id || '');
      if (!assignedDriverIds[recId]) return;
      if (ownDriver && recId === String(ownDriver.id)) {
        driverRecords.push(driverRec);
      } else {
        // Rekan pengemudi cukup nama/telepon untuk manifest; NIK, bank,
        // SIM, dan foto dokumen tidak ikut.
        driverRecords.push(apiPickFields_(driverRec, ['id', 'name', 'phone', 'photo', 'rating', 'status']));
      }
    });

    put('routes', read('routes'));
    putProjected('agencies', publicAgencies);
    putProjected('reviews', publicReviews());
    put('settings', read('settings'));
    put('drivers', driverRecords);
    put('schedules', driverSchedules);
    put('bookings', bookings.filter(function (b) {
      return driverScheduleIds[String((b && b.scheduleId) || '')];
    }));
    put('vehicles', vehicles.filter(function (v) {
      var vid = String((v && v.id) || '');
      return driverVehicleIds[vid] || (driverId && String(v.coopDriverId || '') === driverId);
    }));
    put('maintenanceRequests', read('maintenanceRequests').filter(function (m) {
      return driverId && String((m && m.driverId) || '') === driverId;
    }));
    put('notifications', read('notifications').filter(function (n) {
      var to = apiNormalizeEmail_(n && n.to);
      return to === email || to === 'all';
    }));
    put('users', read('users').filter(function (u) {
      if (!u) return false;
      if (String(u.id) === userId) return true;
      // Pengemudi perlu akun agen induk untuk validasi status travel di klien.
      return u.role === 'agen' && String(u.agencyId || '') === String((ownDriver && ownDriver.agencyId) || '');
    }));
    put('audit', read('audit').filter(function (log) {
      return apiActorMatches_(log, email);
    }));
    return { records: records, revisions: revisions };
  }

  // agen
  var agencyId = String((user && user.agencyId) || '');
  var ownAgency = null;
  for (var a = 0; a < agencies.length; a++) {
    if (String(agencies[a].id) === agencyId) { ownAgency = agencies[a]; break; }
  }
  var agenciesOut = [];
  if (ownAgency) agenciesOut.push(apiStripSecrets_(ownAgency));
  publicAgencies.forEach(function (agency) {
    if (String(agency.id) !== agencyId) {
      agenciesOut.push(apiPickFields_(agency, API_PUBLIC_FIELDS.agencies));
    }
  });
  put('agencies', agenciesOut);

  var agencySchedules = schedules.filter(function (s) {
    return String((s && s.agencyId) || '') === agencyId;
  });
  var otherSchedules = schedules.filter(function (s) {
    var sid = String((s && s.agencyId) || '');
    return sid !== agencyId && !!publicAgencyIds[sid];
  });
  put('schedules', agencySchedules.concat(otherSchedules.map(projectSchedule)));

  var agencyVehicles = vehicles.filter(function (v) {
    return String((v && v.agencyId) || '') === agencyId;
  });
  var otherVehicles = vehicles.filter(function (v) {
    var vid = String((v && v.agencyId) || '');
    return vid !== agencyId && !!publicAgencyIds[vid];
  }).map(function (v) { return apiPickFields_(v, API_PUBLIC_FIELDS.vehicles); });
  put('vehicles', agencyVehicles.concat(otherVehicles));

  var agencyDriverList = read('drivers').filter(function (driver) {
    return String((driver && driver.agencyId) || '') === agencyId;
  });
  put('drivers', agencyDriverList);
  put('maintenanceRequests', read('maintenanceRequests').filter(function (m) {
    return String((m && m.agencyId) || '') === agencyId;
  }));
  put('routeRequests', read('routeRequests').filter(function (r) {
    return String((r && r.agencyId) || '') === agencyId;
  }));

  var agencyScheduleIds = apiIdSet_(agencySchedules);
  var agencyBookings = bookings.filter(function (b) {
    return agencyScheduleIds[String((b && b.scheduleId) || '')];
  });
  put('bookings', agencyBookings);
  var agencyBookingIds = apiIdSet_(agencyBookings);
  put('payments', read('payments').filter(function (p) {
    return agencyBookingIds[String((p && p.bookingId) || '')];
  }));
  put('ledger', read('ledger').filter(function (entry) {
    return String((entry && entry.agencyId) || '') === agencyId;
  }));
  put('vouchers', read('vouchers'));
  putProjected('reviews', read('reviews').filter(function (review) {
    var reviewAgency = String((review && review.agencyId) || '');
    return !reviewAgency || reviewAgency === agencyId || !!publicAgencyIds[reviewAgency];
  }));
  putProjected('banners', read('banners'));
  put('settings', read('settings'));

  var agencyBookingCodes = {};
  agencyBookings.forEach(function (b) {
    if (b && b.code) agencyBookingCodes[String(b.code)] = true;
  });
  put('supportTickets', read('supportTickets').filter(function (ticket) {
    if (String((ticket && ticket.agencyId) || '') === agencyId) return true;
    return String((ticket && ticket.bookingCode) || '') !== '' &&
      !!agencyBookingCodes[String(ticket.bookingCode)];
  }));
  put('notifications', read('notifications').filter(function (n) {
    var to = apiNormalizeEmail_(n && n.to);
    return to === email || to === 'all';
  }));
  put('users', read('users').filter(function (u) {
    if (!u) return false;
    if (String(u.id) === userId) return true;
    return String(u.agencyId || '') === agencyId &&
      (u.role === 'agen' || u.role === 'pengemudi');
  }));
  put('audit', read('audit').filter(function (log) {
    return apiActorMatches_(log, email);
  }));
  put('routes', read('routes'));

  return { records: records, revisions: revisions };
}

/* ------------------------------------------------------------------ */
/* Action: changePassword                                              */
/* ------------------------------------------------------------------ */

function apiChangePassword_(req, cfg) {
  var body = req.body || {};
  var current = String(body.currentPassword || '');
  var next = String(body.newPassword || '');
  if (!current || !next) {
    throw apiError_('VALIDATION', 'Password lama dan baru wajib diisi.');
  }
  if (next.length < API_MIN_PASSWORD_LENGTH) {
    throw apiError_('VALIDATION', 'Password baru minimal ' + API_MIN_PASSWORD_LENGTH + ' karakter.');
  }
  if (current === next) {
    throw apiError_('VALIDATION', 'Password baru harus berbeda dari password lama.');
  }
  var payload = apiTokenVerify_(req.token, cfg.token);
  if (!payload) throw apiError_('UNAUTHORIZED', 'Token tidak valid atau kedaluwarsa.');
  var rateKey = apiRateKey_('chpw', payload.sub);
  apiRateGuard_(rateKey);

  var user = null;
  var users = null;
  var idx = -1;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    users = apiReadCollection_(ss, 'users');
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].id) === String(payload.sub)) {
        idx = i;
        user = users[i];
        break;
      }
    }
    if (!user) throw apiError_('UNAUTHORIZED', 'User tidak ditemukan.');
    if (String(user.status || 'active') !== 'active') {
      throw apiError_('ACCOUNT_BLOCKED', 'Akun tidak aktif.');
    }
    var verified = false;
    if (user.passHash) {
      verified = apiPasswordVerify_(
        current,
        String(user.passHash),
        String(user.passSalt || ''),
        Number(user.passIter || API_PASSWORD_ITERATIONS),
        cfg.pepper
      );
    } else if (user.pass) {
      verified = apiSafeEqual_(String(user.pass), current);
    }
    if (!verified) {
      apiRateFail_(rateKey);
      throw apiError_('UNAUTHORIZED', 'Password lama salah.');
    }
    apiHashForUser_(user, next, cfg);
    user.tokenVersion = (Number(user.tokenVersion || 0) || 0) + 1;
    users[idx] = user;
    var meta = apiReadMeta_(ss);
    apiWriteCollection_(ss, 'users', users);
    apiBumpRev_(meta, 'users');
    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
    apiRateClear_(rateKey);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, data: { user: apiSanitizeRecord_(user) } };
}

/* ------------------------------------------------------------------ */
/* Action: adminCreateUser (superadmin)                                */
/* ------------------------------------------------------------------ */

function apiAdminCreateUser_(req, cfg) {
  var actor = apiAuthedUser_(req, cfg);
  apiRequireRole_(actor, ['superadmin']);

  var body = req.body || {};
  var name = String(body.name || '').trim();
  var email = apiNormalizeEmail_(body.email);
  var phone = String(body.phone || '').trim();
  var password = String(body.password || '');
  var role = String(body.role || '').trim().toLowerCase();
  var requestedStatus = String(body.status || 'active').trim().toLowerCase();
  var status = requestedStatus === 'pending' ? 'pending' :
    requestedStatus === 'suspended' ? 'suspended' : 'active';

  if (!name) throw apiError_('VALIDATION', 'Nama lengkap wajib diisi.');
  if (!apiIsEmail_(email)) throw apiError_('VALIDATION', 'Format email belum benar.');
  if (!phone || apiPhoneDigits_(phone).length < 9) {
    throw apiError_('VALIDATION', 'No HP minimal 9 digit angka.');
  }
  if (password.length < API_MIN_PASSWORD_LENGTH) {
    throw apiError_('VALIDATION', 'Password minimal ' + API_MIN_PASSWORD_LENGTH + ' karakter.');
  }
  if (['agen', 'pengemudi', 'pelanggan'].indexOf(role) < 0) {
    throw apiError_('VALIDATION', 'Role akun tidak valid untuk dibuat lewat API.');
  }

  var user = null;
  var driver = null;
  var drivers = null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var users = apiReadCollection_(ss, 'users');
    for (var i = 0; i < users.length; i++) {
      if (apiNormalizeEmail_(users[i].email) === email) {
        throw apiError_('VALIDATION', 'Email sudah terdaftar.');
      }
    }
    var meta = apiReadMeta_(ss);
    var agencyId = null;

    if (role === 'agen') {
      var agencyIdReq = String(body.agencyId || '').trim();
      var agencies = apiReadCollection_(ss, 'agencies');
      var agency = null;
      for (var a = 0; a < agencies.length; a++) {
        if (String(agencies[a].id) === agencyIdReq) { agency = agencies[a]; break; }
      }
      if (!agency) throw apiError_('VALIDATION', 'Pilih travel agen terlebih dahulu.');
      for (var au = 0; au < users.length; au++) {
        if (users[au].role === 'agen' && String(users[au].agencyId) === agencyIdReq) {
          throw apiError_('VALIDATION', 'Travel ini sudah punya akun agen.');
        }
      }
      agencyId = agencyIdReq;
      if (String(agency.status || '') === 'pending' && status === 'active') status = 'pending';
    } else if (role === 'pengemudi') {
      var driverIdReq = String(body.driverId || '').trim();
      drivers = apiReadCollection_(ss, 'drivers');
      for (var dr = 0; dr < drivers.length; dr++) {
        if (String(drivers[dr].id) === driverIdReq) { driver = drivers[dr]; break; }
      }
      if (!driver) throw apiError_('VALIDATION', 'Pilih data pengemudi terlebih dahulu.');
      if (driver.userEmail && apiNormalizeEmail_(driver.userEmail) !== email) {
        throw apiError_('VALIDATION', 'Email harus sama dengan email pada data pengemudi.');
      }
      for (var de = 0; de < drivers.length; de++) {
        if (String(drivers[de].id) === String(driver.id)) continue;
        if (apiNormalizeEmail_(drivers[de].userEmail) === email) {
          throw apiError_('VALIDATION', 'Email sudah dipakai pengemudi lain.');
        }
      }
      var parent = null;
      for (var pu = 0; pu < users.length; pu++) {
        if (users[pu].role === 'agen' && String(users[pu].agencyId) === String(driver.agencyId)) {
          parent = users[pu];
          break;
        }
      }
      if (!parent) throw apiError_('VALIDATION', 'Travel ini belum punya akun agen — buat akun agen terlebih dahulu.');
      if (String(parent.status || 'active') !== 'active') {
        throw apiError_('VALIDATION', 'Akun agen travel belum aktif — aktifkan akun agen terlebih dahulu.');
      }
      var agenciesForDriver = apiReadAgencyForDriver_(ss, driver.agencyId);
      if (!agenciesForDriver || String(agenciesForDriver.status || '') !== 'active') {
        throw apiError_('VALIDATION', 'Travel belum aktif — aktifkan travel terlebih dahulu.');
      }
      if (status !== 'active' && apiDriverHasActiveSchedule_(apiReadCollection_(ss, 'schedules'), driver.id)) {
        throw apiError_('VALIDATION', 'Pengemudi masih punya jadwal aktif — ganti pengemudi pada jadwal tersebut terlebih dahulu.');
      }
      agencyId = driver.agencyId;
    }

    var userIds = {};
    users.forEach(function (u) { if (u && u.id) userIds[String(u.id)] = true; });
    user = {
      id: apiNewId_('U', userIds),
      name: name,
      email: email,
      phone: phone,
      wa: phone,
      role: role,
      agencyId: role === 'pelanggan' ? null : agencyId,
      status: status,
      photo: ''
    };
    if (role === 'pelanggan') user.favorites = [];
    if (driver) user.profileStep = 'done';
    apiHashForUser_(user, password, cfg);
    users.push(user);
    apiWriteCollection_(ss, 'users', users);
    apiBumpRev_(meta, 'users');

    if (driver) {
      driver.userEmail = email;
      driver.status = status === 'active' ? 'aktif' : 'nonaktif';
      var driverIdx = -1;
      for (var di = 0; di < drivers.length; di++) {
        if (String(drivers[di].id) === String(driver.id)) { driverIdx = di; break; }
      }
      if (driverIdx >= 0) drivers[driverIdx] = driver;
      apiWriteCollection_(ss, 'drivers', drivers);
      apiBumpRev_(meta, 'drivers');
    }

    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, data: { user: apiSanitizeRecord_(user) } };
}

function apiReadAgencyForDriver_(ss, agencyId) {
  var agencies = apiReadCollection_(ss, 'agencies');
  for (var i = 0; i < agencies.length; i++) {
    if (String(agencies[i].id) === String(agencyId)) return agencies[i];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Action: adminSetPassword (superadmin)                               */
/* ------------------------------------------------------------------ */

function apiAdminSetPassword_(req, cfg) {
  var actor = apiAuthedUser_(req, cfg);
  apiRequireRole_(actor, ['superadmin']);

  var body = req.body || {};
  var userId = String(body.userId || '').trim();
  var next = String(body.newPassword || '');
  if (!userId) throw apiError_('VALIDATION', 'userId wajib diisi.');
  if (next.length < API_MIN_PASSWORD_LENGTH) {
    throw apiError_('VALIDATION', 'Password baru minimal ' + API_MIN_PASSWORD_LENGTH + ' karakter.');
  }

  var user = null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var users = apiReadCollection_(ss, 'users');
    var idx = -1;
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].id) === userId) { idx = i; user = users[i]; break; }
    }
    if (!user) throw apiError_('NOT_FOUND', 'User tidak ditemukan.');
    apiHashForUser_(user, next, cfg);
    user.tokenVersion = (Number(user.tokenVersion || 0) || 0) + 1;
    users[idx] = user;
    var meta = apiReadMeta_(ss);
    apiWriteCollection_(ss, 'users', users);
    apiBumpRev_(meta, 'users');
    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, data: { user: apiSanitizeRecord_(user) } };
}

/* ------------------------------------------------------------------ */
/* Action: commit                                                      */
/* ------------------------------------------------------------------ */

function apiCommit_(req, cfg) {
  var user = apiAuthedUser_(req, cfg);
  var role = String(user.role || '');
  if (role !== 'superadmin') {
    throw apiError_('FORBIDDEN', 'Peran Anda belum diizinkan menulis lewat API ini.');
  }
  var allowed = API_COLLECTION_KEYS;
  var body = req.body || {};
  var changes = body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw apiError_('VALIDATION', 'changes harus objek {koleksi:{baseRev,upserts,deletes}}.');
  }
  var keys = Object.keys(changes);
  if (!keys.length) throw apiError_('VALIDATION', 'changes tidak boleh kosong.');
  for (var i = 0; i < keys.length; i++) {
    if (API_COLLECTION_KEYS.indexOf(keys[i]) < 0) {
      throw apiError_('VALIDATION', 'Koleksi tidak dikenal: ' + keys[i]);
    }
    if (allowed.indexOf(keys[i]) < 0) {
      throw apiError_('FORBIDDEN', 'Peran tidak diizinkan menulis ' + keys[i] + '.');
    }
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var meta = apiReadMeta_(ss);
    for (var c = 0; c < keys.length; c++) {
      var target = changes[keys[c]];
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw apiError_('VALIDATION', 'changes.' + keys[c] + ' harus objek.');
      }
      var cur = Number(meta['rev.' + keys[c]] || 0) || 0;
      var want = Number(target.baseRev);
      if (isNaN(want) || want !== cur) {
        throw apiError_('REV_CONFLICT', 'Revisi koleksi ' + keys[c] + ' sudah berubah. Muat ulang data lalu coba lagi.');
      }
      apiValidateUpsertList_(keys[c], target);
      var hasUpserts = Array.isArray(target.upserts) && target.upserts.length > 0;
      var hasDeletes = Array.isArray(target.deletes) && target.deletes.length > 0;
      if (!hasUpserts && !hasDeletes) {
        throw apiError_('VALIDATION', 'Koleksi ' + keys[c] + ' tidak punya perubahan.');
      }
      if (keys[c] === 'users') {
        var selfDeletes = Array.isArray(target.deletes) ? target.deletes : [];
        for (var sd = 0; sd < selfDeletes.length; sd++) {
          if (String(selfDeletes[sd]) === String(user.id)) {
            throw apiError_('VALIDATION', 'Akun sendiri tidak boleh dihapus lewat commit.');
          }
        }
      }
    }
    var revisions = {};
    for (var d = 0; d < keys.length; d++) {
      revisions[keys[d]] = apiApplyCollection_(ss, keys[d], changes[keys[d]], meta);
    }
    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
    return { ok: true, data: { touched: keys, revisions: revisions } };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Terapkan satu koleksi: hapus lalu sisip, tetap menjaga urutan baris yang
 * sudah ada; record yang benar-benar baru ditambah di bagian akhir.
 * Meta rev diperbarui di dalam objek meta sehingga fungsi pemanggil menulis
 * sekali di akhir.
 */
function apiApplyCollection_(ss, key, target, meta) {
  var upserts = Array.isArray(target.upserts) ? target.upserts : [];
  var deletes = Array.isArray(target.deletes) ? target.deletes : [];
  if (upserts.length === 0 && deletes.length === 0) {
    throw apiError_('VALIDATION', 'Koleksi ' + key + ' tidak punya perubahan.');
  }
  var deleted = {};
  deletes.forEach(function (d) { deleted[String(d)] = true; });
  var upserted = {};
  upserts.forEach(function (rec) { upserted[apiRecordId_(rec)] = rec; });
  var existing = apiReadCollection_(ss, key);
  var out = [];
  var emitted = {};
  existing.forEach(function (old) {
    var id = apiRecordId_(old);
    if (deleted[id] && !upserted[id]) return;
    if (upserted[id]) {
      // Record users dari bootstrap sudah tanpa field password. Pertahankan
      // hash/salt lama agar commit profil tidak menghapus kemampuan login.
      apiCopyMissingSecrets_(upserted[id], old);
      out.push(upserted[id]);
      emitted[id] = true;
    } else {
      out.push(old);
    }
  });
  upserts.forEach(function (rec) {
    var id = apiRecordId_(rec);
    if (!emitted[id]) out.push(rec);
  });
  apiWriteCollection_(ss, key, out);
  var nextRev = (Number(meta['rev.' + key] || 0) || 0) + 1;
  meta['rev.' + key] = String(nextRev);
  return nextRev;
}

/** Salin field rahasia lama yang tidak dikirim ulang oleh klien. */
function apiCopyMissingSecrets_(target, source) {
  if (!target || !source || typeof target !== 'object') return;
  for (var i = 0; i < API_SECRET_FIELDS.length; i++) {
    var field = API_SECRET_FIELDS[i];
    if (!Object.prototype.hasOwnProperty.call(target, field) &&
        Object.prototype.hasOwnProperty.call(source, field)) {
      target[field] = source[field];
    }
  }
}
