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
 * Struktur data sama dengan seed.gs (storage v2, normalisasi 1NF penuh):
 *  - Tab `_meta`: kolom key|value.
 *  - Tab koleksi utama: kolom id|ord|updated_at + satu kolom skalar per field
 *    record; nilai disimpan sebagai teks dan dikonversi kembali berdasarkan
 *    tipe kolom saat dibaca.
 *  - Field bertingkat (array/object) dipecah ke tab anak dengan kolom
 *    parent_id + slot/key, satu baris per elemen. Definisi kolom ada di
 *    API_MAIN_TABLES; apiReadCollection_/apiWriteCollection_ memakainya
 *    secara generik untuk semua koleksi.
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

var API_VERSION = '1.3.0';
var API_SERVICE_NAME = 'transaceh-db';

var API_SCHEMA_VERSION = '2';
var API_META_HEADERS = ['key', 'value'];
var API_ROW_HEADERS = ['id', 'ord', 'updated_at'];
var API_MAX_CELL_CHARS = 45000;
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

/** Daftar kunci koleksi (akses runtime; dipakai seed.gs). */
function apiCollectionKeys_() {
  return API_COLLECTION_KEYS;
}

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

/**
 * Koleksi yang boleh ditulis tiap peran lewat aksi `sync`. Ini bukan commit
 * bebas: setiap baris tetap melewati validasi kepemilikan dan field di
 * apiSyncValidateCollection_(). `commit` tetap khusus superadmin.
 */
var API_SYNC_ALLOWED = {
  pelanggan: [
    'users', 'bookings', 'payments', 'ledger', 'vouchers', 'reviews',
    'notifications', 'supportTickets'
  ],
  agen: [
    'agencies', 'users', 'routes', 'vehicles', 'drivers', 'schedules',
    'maintenanceRequests', 'bookings', 'payments', 'ledger', 'vouchers',
    'notifications', 'supportTickets', 'routeRequests'
  ],
  pengemudi: [
    'users', 'drivers', 'schedules', 'bookings', 'payments', 'ledger',
    'vouchers', 'maintenanceRequests', 'notifications', 'supportTickets'
  ],
  superadmin: API_COLLECTION_KEYS
};

/** Agen pending hanya boleh menyimpan KYC agensinya dan profil sendiri. */
var API_SYNC_PENDING_AGEN_ALLOWED = ['agencies', 'users'];

/** Urutan terapkan/validasi: induk dulu, transaksi terakhir. */
var API_SYNC_ORDER = [
  'agencies', 'users', 'routes', 'routeRequests', 'vehicles', 'drivers',
  'schedules', 'maintenanceRequests', 'bookings', 'payments', 'ledger',
  'vouchers', 'reviews', 'notifications', 'supportTickets', 'banners',
  'settings', 'fees', 'audit'
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

/**
 * Ambil tab anak; bila belum ada (skema menambah tab setelah deploy)
 * tab dibuat otomatis bersama header-nya supaya engine tidak macet sebelum
 * `ensureSchema()` (seed.gs) dijalankan.
 */
function apiEnsureChildSheet_(ss, child) {
  var sheet = ss.getSheetByName(child.table);
  if (!sheet) {
    sheet = ss.insertSheet(child.table);
    sheet.getRange(1, 1, 1, child.headers.length).setValues([child.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ------------------------------------------------------------------ */
/* Skema penyimpanan v2 (normalisasi 1NF penuh)                        */
/* ------------------------------------------------------------------ */

/**
 * Definisi kolom untuk tiap koleksi (satu-satunya sumber kebenaran bentuk
 * tab di spreadsheet; seed.gs memakainya juga lewat apiDescribeStore_()).
 *
 * Semua nilai disimpan sebagai teks; prefix menentukan konversi saat dibaca:
 *  - "field"   → teks apa adanya,
 *  - "n:field" → angka (Number),
 *  - "b:field" → boolean ('true'/'false').
 * Alias "sumber>namaKolom" dipakai bila nama field bentrok (mis. "id" pesan
 * tiket → kolom msg_id).
 *
 * Field bertingkat dipecah ke tab anak lewat `children`:
 *  - kind 'list' → array. Kolom anak: parent_id | slot | nilai. Elemen
 *    object memakai kolom per field (`cols`); elemen skalar ditandai
 *    `scalar: true` dan memakai satu kolom "val".
 *  - kind 'map' → object key→nilai. Kolom anak: parent_id | key | nilai.
 *    Elemen skalar juga ditandai `scalar: true`.
 *  - kind 'one' → object 1:1, satu baris per record induk
 *    (kolom anak: parent_id | nilai). Path boleh bertingkat ("kyc.alamat").
 *  - kind 'blob' → object key→objek (mis. kyc.docs) yang kolom besarnya
 *    (`field`, mis. dataUrl base64) lebih besar dari satu sel Sheets.
 *    Nilai dipecah menjadi beberapa baris chunk ≤ API_MAX_CELL_CHARS
 *    (kolom anak: parent_id | key | i | chunk) dan digabung kembali saat
 *    dibaca; kolom lain (metadata) tetap di tab `map` sesama path.
 *  - path '*' (khusus notifications) → semua field record yang bukan kolom
 *    skema disimpan sebagai baris key→val di tab meta notifikasi.
 *
 * Unknown top-level field yang tidak tercakup skema DITOLAK saat tulis agar
 * tidak ada data yang hilang diam-diam.
 */
var API_MAIN_TABLES = {
  users: {
    cols: [
      'name', 'email', 'phone', 'wa', 'role', 'agencyId', 'status', 'photo',
      'address', 'profileStep', 'createdAt', 'updatedAt',
      'passHash', 'passSalt', 'n:passIter', 'passAlgo', 'n:tokenVersion',
      'suspendedByParent', 'parentSuspendedDriverStatus'
    ],
    children: [
      { table: 'users_favorites', path: 'favorites', kind: 'list',
        cols: ['favName>name', 'favPhone>phone'] }
    ]
  },
  agencies: {
    cols: [
      'name', 'logo', 'address', 'phone', 'wa', 'email', 'description',
      'bank', 'status', 'n:serviceFee', 'feeType', 'n:feeValue', 'n:rating',
      'n:trips'
    ],
    children: [
      { table: 'agencies_refund_policy', path: 'refundPolicy', kind: 'list',
        cols: ['n:minH', 'n:pct'] },
      { table: 'agency_kyc', path: 'kyc', kind: 'one', cols: [
        'jenis', 'nama', 'nik', 'tmpLahir', 'tglLahir', 'gender', 'agama',
        'hp', 'email', 'bank', 'rekeningNo', 'rekeningNama', 'b:npwpSamaKtp',
        'npwp', 'badanNama', 'badanBentuk', 'aktaNo', 'npwpUsaha', 'nib',
        'direktur', 'status', 'n:step', 'b:terms', 'submittedAt', 'updatedAt'
      ] },
      { table: 'agency_kyc_alamat', path: 'kyc.alamat', kind: 'one', cols: [
        'jalan', 'rtRw', 'kelurahan', 'kecamatan', 'kota', 'provinsi',
        'kodePos'
      ] },
      { table: 'agency_kyc_alamat_usaha', path: 'kyc.alamatUsaha', kind: 'one',
        cols: ['jalan', 'rtRw', 'kelurahan', 'kecamatan', 'kota', 'provinsi',
          'kodePos'] },
      { table: 'agency_kyc_darurat', path: 'kyc.darurat', kind: 'one', cols: [
        'nama', 'hubungan', 'hp'
      ] },
      { table: 'agency_kyc_docs', path: 'kyc.docs', kind: 'map', cols: [
        'name', 'type', 'n:size', 'at'
      ] },
      { table: 'agency_kyc_doc_blob', path: 'kyc.docs', kind: 'blob',
        field: 'dataUrl', cols: ['n:i', 'chunk'] }
    ]
  },
  routes: {
    cols: [
      'from', 'to', 'distance', 'duration', 'n:basePrice', 'b:homePickup',
      'b:active', 'agencyId', 'driverId'
    ],
    children: [
      { table: 'route_prices', path: 'prices', kind: 'map', scalar: true,
        cols: ['n:val'] },
      { table: 'route_suspensions', path: 'suspensions', kind: 'map', cols: [
        'reason', 'at'
      ] },
      { table: 'route_pickups', path: 'pickups', kind: 'list', scalar: true,
        cols: ['val'] },
      { table: 'route_agency_ids', path: 'agencyIds', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'route_vehicle_ids', path: 'vehicleIds', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'route_driver_ids', path: 'driverIds', kind: 'list',
        scalar: true, cols: ['val'] }
    ]
  },
  routeRequests: {
    cols: [
      'agencyId', 'type', 'routeId', 'from', 'to', 'pickup', 'note',
      'n:price', 'b:homePickup', 'distance', 'duration', 'status',
      'adminNote', 'createdAt', 'decidedAt'
    ],
    children: [
      { table: 'routereq_pickups', path: 'pickups', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'routereq_vehicle_ids', path: 'vehicleIds', kind: 'list',
        scalar: true, cols: ['val'] }
    ]
  },
  vehicles: {
    cols: [
      'agencyId', 'brand', 'model', 'n:year', 'color', 'plate', 'chassis',
      'engine', 'vtype', 'vtypeOther', 'baggage', 'tax', 'stnkExp', 'kir',
      'condition', 'n:capacity', 'photo', 'status', 'ownerName', 'ownerBiz',
      'ownerNik', 'ownerAddr', 'ownerPhone', 'ownerEmail', 'ownership',
      'coopDriverId', 'hasEmail', 'docOther', 'stnkPhoto', 'ktpOwnerPhoto',
      'mainRoute', 'origin', 'dest', 'freq', 'freqOther', 'opSchedule',
      'n:coopTariff', 'coopSys', 'coopOther', 'n:fleetCount', 'hasDriver',
      'driverId', 'backDriverId', 'b:driverConflict', 'drvName', 'drvPhone',
      'drvSim', 'drvSimExp', 'drvExp', 'hasBackup', 'backName', 'backPhone',
      'backSim', 'backSimExp', 'n:seatSeq', 'maintenanceFrom',
      'maintenanceUntil', 'maintenanceRequestId'
    ],
    children: [
      { table: 'vehicle_facilities', path: 'facilities', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'vehicle_docs', path: 'docs', kind: 'list', scalar: true,
        cols: ['val'] },
      { table: 'vehicle_services', path: 'services', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'vehicle_inactive_seats', path: 'inactiveSeats', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'vehicle_layout', path: 'layout', kind: 'list',
        cols: ['sid', 'type'] }
    ]
  },
  drivers: {
    cols: [
      'agencyId', 'name', 'phone', 'wa', 'simType', 'simExp', 'simPhoto',
      'ktpPhoto', 'selfie', 'photo', 'status', 'n:rating', 'n:trips',
      'userEmail', 'birthPlace', 'birthDate', 'gender', 'address', 'nik',
      'marital', 'education', 'emName', 'emPhone', 'emRelation', 'simNumber',
      'bank', 'createdAt', 'updatedAt', 'pendingAt', 'profileVerifiedAt',
      'profileVerifiedBy'
    ],
    children: [
      { table: 'driver_pending_profile', path: 'pendingProfile', kind: 'map',
        scalar: true, cols: ['val'] }
    ]
  },
  schedules: {
    cols: [
      'agencyId', 'routeId', 'date', 'time', 'vehicleId', 'driverId',
      'driverName', 'backupDriverId', 'backupName', 'n:price', 'status',
      'tripStatus', 'createdAt',
      'delayUntil', 'n:delayMinutes', 'n:delayAddedMinutes', 'delayReason',
      'delayNote', 'delayedAt', 'delayedBy', 'tripDelayUpdatedAt',
      'departedAt', 'departedBy', 'earlyStartReason', 'arrivedAt',
      'b:lateCompletion',
      'cancelReason', 'cancelledBy', 'cancelledAt', 'reviewedAt',
      'reviewResult', 'n:refundPct',
      'maintenanceRequestId', 'maintenanceFrom', 'maintenanceUntil',
      'maintenanceStatus', 'maintenanceReason', 'maintenanceUpdatedAt'
    ],
    children: [
      { table: 'schedule_blocked_seats', path: 'blockedSeats', kind: 'list',
        scalar: true, cols: ['val'] },
      { table: 'schedule_delay_history', path: 'delayHistory', kind: 'list',
        cols: ['type', 'at', 'n:minutes', 'until', 'reason', 'note', 'by'] },
      { table: 'schedule_trip_delay_info', path: 'tripDelayInfo', kind: 'list',
        cols: ['type', 'at', 'reason', 'note', 'by'] },
      { table: 'schedule_seat_block_log', path: 'seatBlockLog', kind: 'list',
        cols: ['seat', 'action', 'reason', 'by', 'at'] }
    ]
  },
  maintenanceRequests: {
    cols: [
      'agencyId', 'vehicleId', 'vehicleName', 'vehiclePlate', 'driverId',
      'driverName', 'from', 'until', 'reason', 'status', 'requestedAt',
      'requestedBy', 'decidedAt', 'decidedBy', 'decisionNote'
    ],
    children: [
      { table: 'maintenance_schedule_ids', path: 'affectedScheduleIds',
        kind: 'list', scalar: true, cols: ['val'] },
      { table: 'maintenance_summary', path: 'summary', kind: 'one', cols: [
        'n:schedules', 'n:paidBookings', 'n:pendingBookings', 'n:refunded',
        'n:choices', 'n:replacementOffers', 'n:refundTotal'
      ] }
    ]
  },
  bookings: {
    cols: [
      'code', 'scheduleId', 'userEmail', 'userPhone', 'pickupCoords',
      'n:subtotal', 'n:discount', 'n:total', 'status', 'payMethod', 'voucher',
      'source', 'createdBy', 'createdAt', 'paidAt', 'holdExpiry',
      'tripStatus', 'b:boarded', 'n:rating',
      'n:refundPct', 'n:refundAmount', 'refundScope', 'refundStatus',
      'refundPaidAt', 'refundProcessedAt', 'refundProcessedBy',
      'cancelReason', 'cancelledBy', 'cancelledAt',
      'maintenanceRequestId', 'maintenanceOriginalScheduleId',
      'maintenanceFrom', 'maintenanceUntil', 'maintenanceState',
      'n:maintenanceRefundAmount', 'maintenanceChoiceDeadline',
      'maintenanceResolvedAt', 'replacementScheduleId', 'replacementAt',
      'replacementBy'
    ],
    children: [
      { table: 'booking_passengers', path: 'passengers', kind: 'list', cols: [
        'name', 'phone', 'seat', 'pickup', 'pickupCoords'
      ] },
      { table: 'booking_seats', path: 'seats', kind: 'list', scalar: true,
        cols: ['val'] },
      { table: 'booking_fare', path: 'fare', kind: 'one',
        cols: ['n:ticket', 'n:service', 'n:fee', 'n:total'] }
    ]
  },
  payments: {
    cols: [
      'bookingId', 'n:amount', 'method', 'n:fee', 'time', 'status',
      'n:refundAmount', 'n:refundPct', 'refundScope', 'refundStatus',
      'refundRequestedAt', 'refundedAt', 'refundPaidAt', 'refundProcessedAt'
    ]
  },
  ledger: {
    cols: [
      'bookingId', 'scheduleId', 'agencyId', 'driverId', 'userEmail',
      'n:ticket', 'n:service', 'n:fee', 'n:total', 'status', 'createdAt',
      'releasedAt', 'paidOutAt', 'replacedFromScheduleId'
    ],
    children: [
      { table: 'ledger_seats', path: 'seats', kind: 'list', scalar: true,
        cols: ['val'] }
    ]
  },
  vouchers: {
    cols: [
      'code', 'agencyId', 'type', 'n:value', 'n:maxDisc', 'n:quota', 'n:used',
      'b:active', 'desc'
    ]
  },
  reviews: {
    cols: ['agencyId', 'user', 'n:rating', 'text', 'date', 'trip']
  },
  notifications: {
    cols: ['to', 'title', 'msg', 'ch', 'time', 'b:read'],
    children: [
      { table: 'notifications_meta', path: '*', kind: 'map', scalar: true,
        cols: ['val'] }
    ]
  },
  audit: {
    cols: ['time', 'actor', 'action', 'detail']
  },
  banners: {
    cols: ['title', 'sub', 'b:active']
  },
  supportTickets: {
    cols: [
      'code', 'channel', 'userId', 'userEmail', 'userName', 'userPhone',
      'agencyId', 'b:isGuest', 'category', 'subject', 'bookingCode',
      'description', 'status', 'createdAt', 'updatedAt'
    ],
    children: [
      { table: 'ticket_messages', path: 'messages', kind: 'list', cols: [
        'id>msg_id', 'from', 'text', 'author', 'at'
      ] },
      { table: 'ticket_status_history', path: 'statusHistory', kind: 'list',
        cols: ['status', 'at', 'by', 'note'] }
    ]
  },
  settings: {
    cols: ['key', 'updatedAt'],
    children: [
      { table: 'settings_value', path: 'value', kind: 'map', scalar: true,
        cols: ['val'] }
    ]
  },
  fees: {
    cols: ['defaultType', 'n:defaultValue', 'updatedAt']
  }
};

var API_TABLES_CACHE_ = null;

/** "name" / "n:name" / "b:name" / "src>kolom" → {src,col,type}. */
function apiColumnSpec_(txt) {
  var raw = String(txt);
  var src = raw;
  var col = raw;
  var type = 's';
  if (raw.indexOf('n:') === 0) { type = 'n'; src = raw.slice(2); col = src; }
  else if (raw.indexOf('b:') === 0) { type = 'b'; src = raw.slice(2); col = src; }
  var sep = src.indexOf('>');
  if (sep >= 0) {
    col = src.slice(sep + 1);
    src = src.slice(0, sep);
  }
  if (!src || !col) throw new Error('Definisi kolom tidak valid: ' + raw);
  return { src: src, col: col, type: type };
}

/** Bangun (sekali) definisi tab utama + tab anak dari API_MAIN_TABLES. */
function apiTables_() {
  if (API_TABLES_CACHE_) return API_TABLES_CACHE_;
  var mains = {};
  var childByName = {};
  API_COLLECTION_KEYS.forEach(function (key) {
    var def = API_MAIN_TABLES[key];
    if (!def) throw new Error('API_MAIN_TABLES tidak mendefinisikan ' + key);
    var cols = (def.cols || []).map(apiColumnSpec_);
    var headers = ['id', 'ord'].concat(cols.map(function (c) { return c.col; }))
      .concat(['updated_at']);
    var allowed = {};
    cols.forEach(function (c) { allowed[c.src] = true; });
    var children = [];
    (def.children || []).forEach(function (childDef) {
      allowed[childDef.path] = true;
      var cols2 = (childDef.cols || []).map(apiColumnSpec_);
      if (childByName[childDef.table]) {
        throw new Error('Tab anak duplikat: ' + childDef.table);
      }
      var childHeaders = childDef.kind === 'one'
        ? ['parent_id'].concat(cols2.map(function (c) { return c.col; }))
        : ['parent_id',
            (childDef.kind === 'map' || childDef.kind === 'blob') ? 'key' : 'slot']
            .concat(cols2.map(function (c) { return c.col; }));
      var built = {
        table: childDef.table,
        parent: key,
        path: childDef.path,
        kind: childDef.kind,
        field: childDef.field || '',
        scalar: !!childDef.scalar,
        headers: childHeaders,
        cols: cols2
      };
      children.push(built);
      childByName[childDef.table] = built;
    });
    mains[key] = { headers: headers, cols: cols, allowed: allowed, children: children };
  });
  API_TABLES_CACHE_ = { mains: mains, children: childByName };
  return API_TABLES_CACHE_;
}

/** Nama semua tab yang dihasilkan skema (utama + anak), tanpa _meta. */
function apiAllTableNames_() {
  var store = apiTables_();
  var names = [];
  API_COLLECTION_KEYS.forEach(function (key) {
    names.push(key);
    store.mains[key].children.forEach(function (child) {
      names.push(child.table);
    });
  });
  return names;
}

/**
 * Deskripsi lengkap tab untuk alat-instalasi (seed.gs): daftar tab, header,
 * dan koleksinya. Dipakai seed.gs membuat header + validasi struktur.
 */
function apiDescribeStore_() {
  var store = apiTables_();
  var tables = [];
  API_COLLECTION_KEYS.forEach(function (key) {
    var main = store.mains[key];
    tables.push({ name: key, collection: key, kind: 'main', headers: main.headers });
    main.children.forEach(function (child) {
      tables.push({
        name: child.table,
        collection: key,
        kind: child.kind,
        headers: child.headers
      });
    });
  });
  return { schemaVersion: API_SCHEMA_VERSION, tables: tables };
}

/** Ambil nilai objek di dalam record lewat path "a.b" (tab anak 1NF). */
function apiPathValue_(rec, path) {
  if (path === '*') return rec;
  var cur = rec;
  var parts = String(path).split('.');
  for (var i = 0; i < parts.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/** Pasang nilai objek di path "a.b", membuat objek menengah bila perlu. */
function apiPutPath_(rec, path, value) {
  if (path === '*') throw new Error('Path * tidak bisa dipasang langsung.');
  var parts = String(path).split('.');
  var last = parts.pop();
  var cur = rec;
  for (var i = 0; i < parts.length; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[last] = value;
}

/** Validasi bentuk record terhadap skema (field tak dikenal ditolak keras). */
/** Field transien: boleh ada pada upsert jalur sync, dihapus sebelum tulis.
 *  Dipakai users (pass/password yang di-hash oleh apiSyncPrepareUsers_). */
var API_TRANSIENT_FIELDS_ = { users: { pass: 1, password: 1 } };

function apiValidateRecordSchema_(key, rec) {
  var main = apiTables_().mains[key];
  if (!main) return;
  var transient = API_TRANSIENT_FIELDS_[key] || null;
  var unknown = [];
  var keys = Object.keys(rec || {});
  for (var i = 0; i < keys.length; i++) {
    var k = String(keys[i]);
    if (k === 'id' || k === '_id' || main.allowed[k]) continue;
    if (transient && transient[k]) continue;
    if (key === 'notifications') {
      /* notifications menerima field tambahan apa pun (meta), asal skalar. */
      var v = rec[k];
      if (v == null || typeof v === 'string' || typeof v === 'number' ||
          typeof v === 'boolean') continue;
      throw apiError_('VALIDATION', 'Meta notifikasi harus skalar: ' + k);
    }
    unknown.push(k);
    if (unknown.length >= 3) break;
  }
  if (unknown.length) {
    throw apiError_('VALIDATION', 'Field tidak dikenal pada ' + key +
      ': ' + unknown.join(', ') +
      '. Perbarui API_MAIN_TABLES bila field ini memang terpakai.');
  }
}

function apiCellLengthGuard_(text, ref) {
  if (text.length > API_MAX_CELL_CHARS) {
    throw apiError_('VALIDATION', 'Isi sel "' + ref + '" melebihi ' +
      API_MAX_CELL_CHARS + ' karakter (' + text.length + ').');
  }
  return text;
}

/** Serialisasi satu nilai menjadi isi sel (selalu teks). */
function apiCellFor_(type, value, ref) {
  var text;
  if (value == null) text = '';
  else if (type === 'b') {
    text = (value === true || value === 'true' || value === 1 || value === '1')
      ? 'true' : 'false';
  } else if (type === 'n') {
    if (value === '') text = '';
    else {
      var num = Number(value);
      text = isNaN(num) ? '' : String(num);
    }
  } else {
    if (typeof value === 'object') {
      throw apiError_('VALIDATION', 'Nilai "' + ref + '" berupa object/array - ' +
        'pecah ke tab anak skema, jangan satu sel.');
    }
    text = String(value);
  }
  return apiCellLengthGuard_(text, ref);
}

/** Konversi isi sel (teks) menjadi nilai JS sesuai tipe kolom. */
function apiValueFor_(type, cell) {
  var text = cell == null ? '' : String(cell);
  if (type === 'n') {
    if (!text.trim()) return null;
    var num = Number(text);
    if (isNaN(num)) {
      throw apiError_('DATA_CORRUPT', 'Nilai angka tidak valid di spreadsheet: "' + text + '".');
    }
    return num;
  }
  if (type === 'b') {
    var t = text.trim().toLowerCase();
    if (!t) return null;
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0') return false;
    throw apiError_('DATA_CORRUPT', 'Nilai boolean tidak valid di spreadsheet: "' + text + '".');
  }
  return text;
}

/** Baca baris isi tab (tanpa header). */
function apiReadRows_(sheet, width) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

/**
 * Tulis sejumlah record koleksi ke tab utama + tab anaknya (tulis penuh),
 * lalu kembalikan jumlah record. Bentuk kolom ditentukan API_MAIN_TABLES.
 */
function apiWriteCollection_(ss, key, records) {
  var store = apiTables_();
  var main = store.mains[key];
  if (!main) throw apiError_('SHEET_SCHEMA', 'Koleksi tidak dikenal: ' + key);
  var list = Array.isArray(records) ? records : [];
  var now = apiNowIso_();
  var rows = [];
  var childRows = {};
  main.children.forEach(function (child) { childRows[child.table] = []; });

  for (var i = 0; i < list.length; i++) {
    var rec = list[i];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      throw apiError_('VALIDATION', 'Record pada ' + key + ' indeks ' + i + ' harus objek.');
    }
    var id = apiRecordId_(rec);
    if (!id) {
      throw apiError_('VALIDATION', 'Record pada ' + key + ' indeks ' + i + ' tidak punya id.');
    }
    apiValidateRecordSchema_(key, rec);
    var row = [id, String(i + 1)];
    for (var c = 0; c < main.cols.length; c++) {
      var col = main.cols[c];
      row.push(apiCellFor_(col.type, rec[col.src], key + '.' + id + '.' + col.col));
    }
    row.push(now);
    rows.push(row);

    main.children.forEach(function (child) {
      apiBuildChildRows_(child, id, rec, key, childRows[child.table]);
    });
  }

  var sheet = apiSheet_(ss, key);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, main.headers.length).clearContent();
  }
  if (rows.length) {
    var range = sheet.getRange(2, 1, rows.length, main.headers.length);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
  main.children.forEach(function (child) {
    apiWriteTableRows_(apiEnsureChildSheet_(ss, child), child, childRows[child.table]);
  });
  return rows.length;
}

/** Susun baris tab anak dari satu record (array/map/object 1:1). */
function apiBuildChildRows_(child, parentId, rec, key, sink) {
  if (child.path === '*') {
    /* notifications: field di luar skema dikumpulkan sebagai map meta. */
    var mainAllowed = apiTables_().mains[child.parent].allowed;
    Object.keys(rec).forEach(function (mk) {
      if (mk === 'id' || mk === '_id' || mainAllowed[mk]) return;
      var v = rec[mk];
      if (v == null || v === '') return;
      sink.push([parentId, mk,
        apiCellFor_('s', String(v), child.table + '/' + parentId + '.' + mk)]);
    });
    return;
  }

  var raw = apiPathValue_(rec, child.path);
  if (raw == null) return;

  if (child.kind === 'list') {
    if (!Array.isArray(raw)) {
      throw apiError_('VALIDATION', 'Field "' + child.path + '" pada ' + key +
        '/' + parentId + ' harus array.');
    }
    for (var i = 0; i < raw.length; i++) {
      var el = raw[i];
      var row = [parentId, String(i + 1)];
      if (child.scalar) {
        row.push(apiCellFor_(child.cols[0].type, el,
          child.table + '/' + parentId + '#' + (i + 1)));
      } else {
        if (!el || typeof el !== 'object' || Array.isArray(el)) {
          throw apiError_('VALIDATION', 'Elemen "' + child.path + '" pada ' +
            key + '/' + parentId + ' harus objek.');
        }
        child.cols.forEach(function (col) {
          row.push(apiCellFor_(col.type, el[col.src],
            child.table + '/' + parentId + '#' + (i + 1) + '.' + col.col));
        });
      }
      sink.push(row);
    }
    return;
  }

  /* kind 'blob': string besar (mis. dataUrl dokumen KYC) dipecah menjadi
     beberapa baris chunk; panjang tiap sel ≤ API_MAX_CELL_CHARS agar lolos
     batas keras Google Sheets (50.000 karakter/sel). */
  if (child.kind === 'blob') {
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw apiError_('VALIDATION', 'Field "' + child.path + '" pada ' + key +
        '/' + parentId + ' harus objek.');
    }
    var bField = child.field || 'dataUrl';
    Object.keys(raw).forEach(function (bmk) {
      var bv = raw[bmk];
      if (bv == null) return;
      if (!bv || typeof bv !== 'object' || Array.isArray(bv)) {
        throw apiError_('VALIDATION', 'Nilai "' + child.path + '.' + bmk +
          '" pada ' + key + '/' + parentId + ' harus objek.');
      }
      var bText = String(bv[bField] == null ? '' : bv[bField]);
      if (!bText) {
        sink.push([parentId, bmk, '1', '']);
        return;
      }
      for (var boff = 0; boff < bText.length; boff += API_MAX_CELL_CHARS) {
        var bi = Math.floor(boff / API_MAX_CELL_CHARS) + 1;
        sink.push([parentId, bmk, String(bi),
          apiCellFor_('s', bText.slice(boff, boff + API_MAX_CELL_CHARS),
            child.table + '/' + parentId + '.' + bmk + '#' + bi)]);
      }
    });
    return;
  }

  if (child.kind === 'map') {
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw apiError_('VALIDATION', 'Field "' + child.path + '" pada ' + key +
        '/' + parentId + ' harus objek.');
    }
    Object.keys(raw).forEach(function (mk) {
      var v = raw[mk];
      if (v == null) return;
      var row = [parentId, mk];
      if (child.scalar) {
        row.push(apiCellFor_(child.cols[0].type, v,
          child.table + '/' + parentId + '.' + mk));
      } else {
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
          throw apiError_('VALIDATION', 'Nilai "' + child.path + '.' + mk +
            '" pada ' + key + '/' + parentId + ' harus objek.');
        }
        child.cols.forEach(function (col) {
          row.push(apiCellFor_(col.type, v[col.src],
            child.table + '/' + parentId + '.' + mk + '.' + col.col));
        });
      }
      sink.push(row);
    });
    return;
  }

  /* kind 'one': satu baris per record; kosong/null tidak menulis apa pun. */
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw apiError_('VALIDATION', 'Field "' + child.path + '" pada ' + key +
      '/' + parentId + ' harus objek.');
  }
  var rowOne = [parentId];
  child.cols.forEach(function (col) {
    rowOne.push(apiCellFor_(col.type, raw[col.src],
      child.table + '/' + parentId + '.' + col.col));
  });
  sink.push(rowOne);
}

/** Tulis baris ke satu tab (utama atau anak) dengan format teks. */
function apiWriteTableRows_(sheet, tableDef, rows) {
  if (!sheet) {
    throw apiError_('SHEET_NOT_FOUND', 'Tab ' + tableDef.table + ' tidak ditemukan.');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, tableDef.headers.length).clearContent();
  }
  if (!rows.length) return;
  var range = sheet.getRange(2, 1, rows.length, tableDef.headers.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

/**
 * Baca satu koleksi dari tab utama + tab anaknya. Array selalu
 * dimaterialisasi ([] saat kosong); map dan child 1:1 hanya muncul bila ada
 * barisnya. Urutan record mengikuti urutan baris tab utama.
 */
function apiReadCollection_(ss, key) {
  var store = apiTables_();
  var main = store.mains[key];
  if (!main) throw apiError_('SHEET_SCHEMA', 'Koleksi tidak dikenal: ' + key);
  var sheet = apiSheet_(ss, key);
  var rows = apiReadRows_(sheet, main.headers.length);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var hasData = String(row[0] == null ? '' : row[0]).trim() !== '';
    if (!hasData) {
      for (var h = 2; h < main.headers.length; h++) {
        if (String(row[h] == null ? '' : row[h]).trim() !== '') { hasData = true; break; }
      }
    }
    if (!hasData) continue;
    var rec = { id: String(row[0] == null ? '' : row[0]).trim() };
    for (var c = 0; c < main.cols.length; c++) {
      var col = main.cols[c];
      rec[col.src] = apiValueFor_(col.type, row[c + 2]);
    }
    out.push(rec);
  }
  if (!out.length) return out;

  main.children.forEach(function (child) {
    var childRows = apiReadRows_(apiEnsureChildSheet_(ss, child), child.headers.length);
    var grouped = {};
    for (var r = 0; r < childRows.length; r++) {
      var crow = childRows[r];
      var pid = String(crow[0] == null ? '' : crow[0]).trim();
      if (!pid) continue;
      var val;
      var off = child.kind === 'one' ? 1 : 2;
      if (child.kind === 'blob') {
        /* blob: kumpulkan pecahan [i, teks]; digabung saat attach. */
        var bkey = String(crow[1] == null ? '' : crow[1]);
        if (!bkey) continue;
        var bidx = apiValueFor_(child.cols[0].type, crow[off]);
        var btext = crow[off + 1] == null ? '' : String(crow[off + 1]);
        if (!grouped[pid]) grouped[pid] = {};
        if (!grouped[pid][bkey]) grouped[pid][bkey] = [];
        grouped[pid][bkey].push([Number(bidx) || 0, btext]);
        continue;
      }
      if (child.scalar) {
        val = apiValueFor_(child.cols[0].type, crow[off]);
      } else {
        val = {};
        for (var cc = 0; cc < child.cols.length; cc++) {
          var spec = child.cols[cc];
          val[spec.src] = apiValueFor_(spec.type, crow[off + cc]);
        }
      }
      if (val == null) continue;
      if (child.kind === 'one') {
        if (grouped[pid] == null) grouped[pid] = val;
      } else if (child.kind === 'map') {
        var key2 = String(crow[1] == null ? '' : crow[1]);
        if (!key2) continue;
        if (!grouped[pid]) grouped[pid] = {};
        grouped[pid][key2] = val;
      } else {
        if (!Array.isArray(grouped[pid])) grouped[pid] = [];
        grouped[pid].push(val);
      }
    }
    out.forEach(function (rec) {
      var sid = String(rec.id == null ? '' : rec.id);
      if (child.path === '*') {
        Object.keys(grouped[sid] || {}).forEach(function (mk) {
          rec[mk] = grouped[sid][mk];
        });
        return;
      }
      if (child.kind === 'list' && !Array.isArray(grouped[sid])) {
        apiPutPath_(rec, child.path, []);
      } else if (child.kind === 'blob' && grouped[sid] != null) {
        /* blob: gabungkan pecahan ke objek di path yang sama (metadata
           dari tab map sudah dilekatkan lebih dulu, urutan children). */
        var holder = apiPathValue_(rec, child.path);
        if (!holder || typeof holder !== 'object') {
          holder = {};
          apiPutPath_(rec, child.path, holder);
        }
        Object.keys(grouped[sid]).forEach(function (bk) {
          var parts = grouped[sid][bk].slice()
            .sort(function (x, y) { return x[0] - y[0]; })
            .map(function (p) { return p[1]; });
          var blobDoc = holder[bk];
          if (!blobDoc || typeof blobDoc !== 'object') { blobDoc = {}; holder[bk] = blobDoc; }
          blobDoc[child.field || 'dataUrl'] = parts.join('');
        });
      } else if (grouped[sid] != null) {
        apiPutPath_(rec, child.path, grouped[sid]);
      }
    });
  });
  return out;
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
  // Voucher lama hanya punya `code`; kode unik dan dipakai sebagai id baris.
  if (record.code != null && record.code !== '') return String(record.code);
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
    apiValidateRecordSchema_(key, rec);
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
  var accountStatus = String(user.status || 'active');
  if (accountStatus !== 'active' && !(user.role === 'agen' && accountStatus === 'pending')) {
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
    case 'sync': return apiSync_(req, cfg);
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
    var loginStatus = String(user.status || 'active');
    if (loginStatus !== 'active' && !(user.role === 'agen' && loginStatus === 'pending')) {
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
    var bootStatus = String(user.status || 'active');
    if (bootStatus !== 'active' && !(user.role === 'agen' && bootStatus === 'pending')) {
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

  /*
   * Agen pending hanya boleh login untuk melengkapi KYC. Jangan kirim
   * katalog publik/agensi lain; cukup agensinya sendiri + akunnya.
   */
  if (role === 'agen' && String(user && user.status || '') === 'pending') {
    var pendingAgencyId = String((user && user.agencyId) || '');
    var pendingAgency = null;
    for (var pa = 0; pa < agencies.length; pa++) {
      if (String(agencies[pa].id) === pendingAgencyId) { pendingAgency = agencies[pa]; break; }
    }
    put('agencies', pendingAgency ? [apiStripSecrets_(pendingAgency)] : []);
    put('users', read('users').filter(function (u) {
      return String((u && u.id) || '') === String((user && user.id) || '');
    }));
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

    /* Pelanggan boleh melihat pengemudi hanya pada jadwal booking miliknya. */
    var ownScheduleIds = {};
    ownBookings.forEach(function (b) {
      if (b && b.scheduleId) ownScheduleIds[String(b.scheduleId)] = true;
    });
    var ownScheduleMap = {};
    schedules.forEach(function (sc) {
      if (sc && ownScheduleIds[String(sc.id)]) ownScheduleMap[String(sc.id)] = sc;
    });
    var customerSchedules = publicSchedules(schedules).map(function (ps) {
      var own = ownScheduleMap[String(ps.id)];
      if (!own) return ps;
      ps.driverId = own.driverId || '';
      ps.driverName = own.driverName || '';
      ps.backupDriverId = own.backupDriverId || '';
      ps.backupName = own.backupName || '';
      return ps;
    });
    Object.keys(ownScheduleMap).forEach(function (sid) {
      var found = false;
      for (var cs = 0; cs < customerSchedules.length; cs++) {
        if (String(customerSchedules[cs].id) === String(sid)) { found = true; break; }
      }
      if (found) return;
      var own = ownScheduleMap[sid];
      var out = apiPickFields_(own, API_PUBLIC_FIELDS.schedules);
      out.takenSeats = takenSeats[sid] || [];
      out.driverId = own.driverId || '';
      out.driverName = own.driverName || '';
      out.backupDriverId = own.backupDriverId || '';
      out.backupName = own.backupName || '';
      customerSchedules.push(out);
    });
    put('schedules', customerSchedules);

    var customerDriverIds = {};
    Object.keys(ownScheduleMap).forEach(function (sid) {
      var sc = ownScheduleMap[sid] || {};
      if (sc.driverId) customerDriverIds[String(sc.driverId)] = true;
      if (sc.backupDriverId) customerDriverIds[String(sc.backupDriverId)] = true;
    });
    put('drivers', read('drivers').filter(function (driver) {
      return !!customerDriverIds[String((driver && driver.id) || '')];
    }).map(function (driver) {
      return apiPickFields_(driver, ['id', 'name', 'phone', 'photo', 'rating', 'status']);
    }));

    put('settings', read('settings'));
    put('bookings', ownBookings);
    put('payments', read('payments').filter(function (p) {
      return ownBookingIds[String((p && p.bookingId) || '')];
    }));
    put('ledger', read('ledger').filter(function (entry) {
      return ownBookingIds[String((entry && entry.bookingId) || '')];
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
    var driverAgencies = publicAgencies.slice();
    var driverAgency = null;
    if (ownDriver) {
      for (var da = 0; da < agencies.length; da++) {
        if (String(agencies[da].id) === String(ownDriver.agencyId || '')) { driverAgency = agencies[da]; break; }
      }
    }
    if (driverAgency && !publicAgencyIds[String(driverAgency.id)]) {
      driverAgencies.push(apiPickFields_(driverAgency, API_PUBLIC_FIELDS.agencies));
    }
    putProjected('agencies', driverAgencies);
    putProjected('reviews', publicReviews());
    put('settings', read('settings'));
    put('drivers', driverRecords);
    put('schedules', driverSchedules);
    var driverBookings = bookings.filter(function (b) {
      return driverScheduleIds[String((b && b.scheduleId) || '')];
    });
    put('bookings', driverBookings);
    var driverBookingIds = apiIdSet_(driverBookings);
    put('payments', read('payments').filter(function (p) {
      return driverBookingIds[String((p && p.bookingId) || '')];
    }));
    put('ledger', read('ledger').filter(function (entry) {
      return driverScheduleIds[String((entry && entry.scheduleId) || '')] ||
        driverBookingIds[String((entry && entry.bookingId) || '')];
    }));
    put('vouchers', read('vouchers'));
    put('vehicles', vehicles.filter(function (v) {
      var vid = String((v && v.id) || '');
      return driverVehicleIds[vid] || (driverId && String(v.coopDriverId || '') === driverId);
    }).map(function (v) {
      return apiPickFields_(v, API_PUBLIC_FIELDS.vehicles);
    }));
    put('maintenanceRequests', read('maintenanceRequests').filter(function (m) {
      return driverId && String((m && m.driverId) || '') === driverId;
    }));
    put('notifications', read('notifications').filter(function (n) {
      var to = apiNormalizeEmail_(n && n.to);
      return to === email || to === 'all';
    }));
    put('supportTickets', read('supportTickets').filter(function (t) {
      return apiNormalizeEmail_(t && t.userEmail) === email ||
        String((t && t.userId) || '') === userId;
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
    if (Number(payload.pv || 0) !== Number(user.tokenVersion || 0)) {
      throw apiError_('UNAUTHORIZED', 'Sesi sudah tidak berlaku. Silakan masuk lagi.');
    }
    var pwStatus = String(user.status || 'active');
    if (pwStatus !== 'active' && !(user.role === 'agen' && pwStatus === 'pending')) {
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
/* Action: sync (tulis ter-scope per peran)                            */
/* ------------------------------------------------------------------ */

/**
 * Menulis perubahan dari klien dengan batas koleksi + kepemilikan baris.
 * Bentuk body sama dengan commit: {changes:{koleksi:{baseRev,upserts,deletes}}}.
 * Berbeda dari commit, peran non-superadmin hanya boleh menyentuh koleksi
 * yang tercantum di API_SYNC_ALLOWED dan setiap baris diverifikasi di sini.
 */
function apiSync_(req, cfg) {
  var user = apiAuthedUser_(req, cfg);
  var role = String(user.role || '');
  var pendingAgen = role === 'agen' && String(user.status || 'active') === 'pending';
  var allowed = pendingAgen ? API_SYNC_PENDING_AGEN_ALLOWED : (API_SYNC_ALLOWED[role] || []);
  if (!allowed.length) {
    throw apiError_('FORBIDDEN', 'Peran Anda belum diizinkan menulis data.');
  }

  var body = req.body || {};
  var changes = body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw apiError_('VALIDATION', 'changes harus objek {koleksi:{baseRev,upserts,deletes}}.');
  }
  var rawKeys = Object.keys(changes);
  if (!rawKeys.length) throw apiError_('VALIDATION', 'changes tidak boleh kosong.');
  for (var i = 0; i < rawKeys.length; i++) {
    var rawKey = rawKeys[i];
    if (API_COLLECTION_KEYS.indexOf(rawKey) < 0) {
      throw apiError_('VALIDATION', 'Koleksi tidak dikenal: ' + rawKey);
    }
    if (allowed.indexOf(rawKey) < 0) {
      throw apiError_('FORBIDDEN', 'Peran tidak diizinkan menulis ' + rawKey + '.');
    }
  }

  var keys = [];
  API_SYNC_ORDER.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) keys.push(key);
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(API_LOCK_WAIT_MS)) {
    throw apiError_('LOCK_TIMEOUT', 'Server sedang diproses. Coba lagi sebentar.');
  }
  try {
    var ss = apiSpreadsheet_();
    var meta = apiReadMeta_(ss);
    var ctx = {
      ss: ss,
      meta: meta,
      user: user,
      role: role,
      pendingAgen: pendingAgen,
      changes: changes,
      current: {},
      currentMap: {},
      pending: {},
      deleted: {},
      ownDriverId: '',
      touchedSchedules: {}
    };

    var refKeys = ['users', 'agencies', 'routes', 'vehicles', 'drivers', 'schedules', 'bookings'];
    for (var r = 0; r < refKeys.length; r++) {
      var refKey = refKeys[r];
      if (!Object.prototype.hasOwnProperty.call(ctx.current, refKey)) {
        ctx.current[refKey] = apiReadCollection_(ss, refKey);
        ctx.currentMap[refKey] = apiIndexById_(ctx.current[refKey]);
      }
    }

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var target = changes[key];
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw apiError_('VALIDATION', 'changes.' + key + ' harus objek.');
      }
      var cur = Number(meta['rev.' + key] || 0) || 0;
      var want = Number(target.baseRev);
      if (isNaN(want) || want !== cur) {
        throw apiError_('REV_CONFLICT', 'Revisi koleksi ' + key + ' sudah berubah. Muat ulang data lalu coba lagi.');
      }
      apiSyncValidateTargetShape_(key, target);
      if (!Object.prototype.hasOwnProperty.call(ctx.current, key)) {
        ctx.current[key] = apiReadCollection_(ss, key);
        ctx.currentMap[key] = apiIndexById_(ctx.current[key]);
      }
      ctx.pending[key] = apiIndexById_(target.upserts || []);
      ctx.deleted[key] = {};
      (target.deletes || []).forEach(function (id) {
        ctx.deleted[key][String(id)] = true;
      });
    }

    // Pengemudi perlu tahu record driver miliknya untuk validasi baris.
    if (role === 'pengemudi') {
      var email = apiNormalizeEmail_(user.email);
      var currentDrivers = ctx.current.drivers || [];
      var pendingDrivers = (changes.drivers && changes.drivers.upserts) || [];
      var allDrivers = currentDrivers.concat(pendingDrivers);
      for (var d = 0; d < allDrivers.length; d++) {
        if (apiNormalizeEmail_(allDrivers[d].userEmail) === email) {
          ctx.ownDriverId = String(allDrivers[d].id || '');
          break;
        }
      }
    }

    if (changes.users) apiSyncPrepareUsers_(ctx, cfg);

    for (var v = 0; v < keys.length; v++) {
      if (keys[v] === 'users') continue;
      apiSyncValidateCollection_(ctx, keys[v], changes[keys[v]]);
    }
    apiSyncCrossValidate_(ctx);

    var revisions = {};
    for (var a = 0; a < keys.length; a++) {
      revisions[keys[a]] = apiApplyCollection_(ss, keys[a], changes[keys[a]], meta);
    }
    apiUpdateMeta_(ss, meta);
    SpreadsheetApp.flush();
    return { ok: true, data: { touched: keys, revisions: revisions } };
  } finally {
    lock.releaseLock();
  }
}

function apiSyncValidateTargetShape_(key, target) {
  var upserts = target.upserts == null ? [] : target.upserts;
  var deletes = target.deletes == null ? [] : target.deletes;
  if (!Array.isArray(upserts) || !Array.isArray(deletes)) {
    throw apiError_('VALIDATION', 'upserts dan deletes pada ' + key + ' harus array.');
  }
  if (!upserts.length && !deletes.length) {
    throw apiError_('VALIDATION', 'Koleksi ' + key + ' tidak punya perubahan.');
  }
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
    var hasPass = Object.prototype.hasOwnProperty.call(rec, 'pass');
    var hasPassword = Object.prototype.hasOwnProperty.call(rec, 'password');
    if (hasPass && hasPassword) {
      throw apiError_('VALIDATION', 'Gunakan hanya salah satu field pass/password.');
    }
    for (var f = 0; f < API_SECRET_FIELDS.length; f++) {
      var field = API_SECRET_FIELDS[f];
      if (!Object.prototype.hasOwnProperty.call(rec, field)) continue;
      if (key === 'users' && (field === 'pass' || field === 'password')) continue;
      throw apiError_('VALIDATION', 'Field rahasia "' + field + '" tidak boleh ditulis dari klien.');
    }
    apiValidateRecordSchema_(key, rec);
  }
  var delSeen = {};
  for (var d = 0; d < deletes.length; d++) {
    var delId = String(deletes[d] == null ? '' : deletes[d]);
    if (!delId) throw apiError_('VALIDATION', 'Id delete pada ' + key + ' kosong.');
    if (delSeen[delId]) throw apiError_('VALIDATION', 'Id delete duplikat di ' + key + ': ' + delId);
    if (seen[delId]) throw apiError_('VALIDATION', 'Id ' + delId + ' tidak boleh di-upsert dan dihapus sekaligus.');
    delSeen[delId] = true;
  }
}

/** Nilai kosong (absen/null/'') dianggap sederajat: penyimpanan kolom tidak
 *  membedakan field yang tidak diisi dengan field kosong. */
function apiSyncValueEmpty_(value) {
  return value === undefined || value === null || value === '';
}

/** Bandingkan dua nilai record dengan semantik penyimpanan kolom v2. */
function apiSyncValueChanged_(a, b) {
  if (apiSyncValueEmpty_(a) && apiSyncValueEmpty_(b)) return false;
  if (a === b) return false;
  if (typeof a !== 'object' && typeof b !== 'object') {
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return String(a) !== String(b);
    }
    if (typeof a === 'number' || typeof b === 'number') {
      var na = typeof a === 'number' ? a : Number(a);
      var nb = typeof b === 'number' ? b : Number(b);
      if (isFinite(na) && isFinite(nb)) return Math.abs(na - nb) > 0.000001;
    }
    return String(a) !== String(b);
  }
  return JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b);
}

function apiSyncChangedFields_(rec, old) {
  var keys = {};
  Object.keys(rec || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(old || {}).forEach(function (k) { keys[k] = true; });
  var out = [];
  Object.keys(keys).forEach(function (k) {
    if (k === 'id' || k === '_id') return;
    if (apiSyncValueChanged_(rec ? rec[k] : undefined, old ? old[k] : undefined)) out.push(k);
  });
  return out;
}

/** Tolak field yang tidak ada di whitelist. Dipakai untuk record baru agar
 *  klien tidak bisa menyelipkan field refund/maintenance/otorisasi. */
function apiSyncRejectUnknownFields_(rec, allowed, label) {
  var keys = Object.keys(rec || {});
  for (var i = 0; i < keys.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(allowed, keys[i])) {
      throw apiError_('FORBIDDEN', 'Field "' + keys[i] + '" tidak boleh diisi pada ' + label + '.');
    }
  }
}

function apiSyncVoucherRestoreCount_(ctx, code) {
  var needle = String(code || '').trim().toUpperCase();
  if (!needle) return 0;
  var bookings = (ctx.changes.bookings && ctx.changes.bookings.upserts) || [];
  var current = ctx.currentMap.bookings || {};
  var count = 0;
  for (var i = 0; i < bookings.length; i++) {
    var next = bookings[i] || {};
    var old = current[apiRecordId_(next)] || null;
    if (!old) continue;
    var oldCode = String(old.voucher || old.voucherCode || '').trim().toUpperCase();
    if (oldCode !== needle) continue;
    if (String(old.status || '') === 'cancelled' || String(next.status || '') !== 'cancelled') continue;
    if (apiSyncNumber_(old.discount, 0) <= 0) continue;
    count += 1;
  }
  return count;
}

function apiSyncSameExcept_(rec, old, except) {
  var skip = except || {};
  var changed = apiSyncChangedFields_(rec, old);
  for (var i = 0; i < changed.length; i++) {
    if (!skip[changed[i]]) return false;
  }
  return true;
}

function apiSyncEnsureCollection_(ctx, key) {
  if (Object.prototype.hasOwnProperty.call(ctx.current, key)) return ctx.current[key];
  ctx.current[key] = apiReadCollection_(ctx.ss, key);
  ctx.currentMap[key] = apiIndexById_(ctx.current[key]);
  return ctx.current[key];
}

function apiSyncFind_(ctx, key, id) {
  var sid = String(id == null ? '' : id);
  if (!sid) return null;
  if (ctx.deleted[key] && ctx.deleted[key][sid]) return null;
  if (ctx.pending[key] && ctx.pending[key][sid]) return ctx.pending[key][sid];
  if (!ctx.currentMap[key]) apiSyncEnsureCollection_(ctx, key);
  return (ctx.currentMap[key] && ctx.currentMap[key][sid]) || null;
}

function apiSyncFindUserByEmail_(ctx, email) {
  var needle = apiNormalizeEmail_(email);
  if (!needle) return null;
  var users = ctx.current.users || [];
  var upserts = (ctx.changes.users && ctx.changes.users.upserts) || [];
  var all = users.concat(upserts);
  for (var i = 0; i < all.length; i++) {
    if (apiNormalizeEmail_(all[i].email) === needle) return all[i];
  }
  return null;
}

function apiSyncMergeList_(ctx, key) {
  var map = {};
  var current = apiSyncEnsureCollection_(ctx, key) || [];
  for (var i = 0; i < current.length; i++) {
    var id = apiRecordId_(current[i]);
    if (id) map[id] = current[i];
  }
  var upserts = (ctx.changes[key] && ctx.changes[key].upserts) || [];
  for (var u = 0; u < upserts.length; u++) {
    var uid = apiRecordId_(upserts[u]);
    if (uid) map[uid] = upserts[u];
  }
  var deletes = (ctx.changes[key] && ctx.changes[key].deletes) || [];
  for (var d = 0; d < deletes.length; d++) delete map[String(deletes[d])];
  return Object.keys(map).map(function (k) { return map[k]; });
}

function apiSyncNumber_(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function apiSyncScheduleDepartureMs_(schedule) {
  if (!schedule || !schedule.date) return NaN;
  var date = String(schedule.date || '');
  var time = String(schedule.time || '00:00');
  var ms = new Date(date + 'T' + (time.length === 5 ? time : time.slice(0, 5)) + ':00').getTime();
  if (schedule.delayUntil) {
    var delayed = new Date(schedule.delayUntil).getTime();
    if (isFinite(delayed) && delayed > ms) ms = delayed;
  }
  return ms;
}

function apiSyncScheduleBookable_(schedule) {
  if (!schedule) return false;
  if (String(schedule.status || '') !== 'open') return false;
  if (['ontrip', 'arrived', 'missed', 'cancelled'].indexOf(String(schedule.tripStatus || 'scheduled')) >= 0) {
    return false;
  }
  if (String(schedule.maintenanceStatus || '') === 'active') {
    var date = String(schedule.date || '');
    var from = String(schedule.maintenanceFrom || '');
    var until = String(schedule.maintenanceUntil || '');
    if ((!from || date >= from) && (!until || date <= until)) return false;
  }
  var departure = apiSyncScheduleDepartureMs_(schedule);
  return isFinite(departure) && departure > Date.now();
}

function apiSyncPlatformFee_(ctx) {
  var settings = apiSyncEnsureCollection_(ctx, 'settings') || [];
  for (var i = 0; i < settings.length; i++) {
    if (String(settings[i].key || '') === 'platformFee' && settings[i].value) {
      return settings[i].value;
    }
  }
  return { type: 'percent', value: 8 };
}

function apiSyncServicePerSeat_(ctx, schedule) {
  var agency = schedule ? apiSyncFind_(ctx, 'agencies', schedule.agencyId) : null;
  return apiSyncNumber_(agency && agency.serviceFee != null ? agency.serviceFee : 10000, 10000);
}

function apiSyncSplitFare_(ctx, schedule, seatCount, discount, source) {
  var n = Math.max(1, apiSyncNumber_(seatCount, 1));
  var paid = Math.max(0, apiSyncNumber_(schedule && schedule.price, 0) * n - apiSyncNumber_(discount, 0));
  var pf = apiSyncPlatformFee_(ctx) || { type: 'percent', value: 8 };
  var base = String(pf.type || 'percent') === 'flat'
    ? Math.max(0, paid - apiSyncNumber_(pf.value, 0))
    : paid / (1 + apiSyncNumber_(pf.value, 8) / 100);
  var service = String(source || '') === 'driver'
    ? 0
    : Math.min(apiSyncServicePerSeat_(ctx, schedule) * n, Math.round(base));
  var ticket = Math.max(0, Math.round(base) - service);
  var fee = Math.max(0, paid - ticket - service);
  return { ticket: ticket, service: service, fee: fee, total: paid };
}

function apiSyncRefundPolicy_(ctx, schedule) {
  var agency = schedule ? apiSyncFind_(ctx, 'agencies', schedule.agencyId) : null;
  var raw = agency && Array.isArray(agency.refundPolicy) ? agency.refundPolicy : [];
  if (!raw.length) {
    raw = [
      { minH: 72, pct: 100 },
      { minH: 24, pct: 50 },
      { minH: 0, pct: 0 }
    ];
  }
  var out = [];
  raw.forEach(function (item) {
    var minH = Math.max(0, Math.round(apiSyncNumber_(item && item.minH, 0)));
    var pct = Math.max(0, Math.min(100, apiSyncNumber_(item && item.pct, 0)));
    out.push({ minH: minH, pct: pct });
  });
  out.sort(function (a, b) { return b.minH - a.minH; });
  if (!out.some(function (x) { return x.minH === 0; })) out.push({ minH: 0, pct: 0 });
  return out;
}

function apiSyncRefundExpectation_(ctx, booking, schedule, next) {
  if (!booking || !schedule) return { pct: 0, amount: 0, scope: 'ticket' };
  if (String(booking.status || '') === 'pending') {
    return { pct: 0, amount: 0, scope: 'total' };
  }
  /* Refund 100% hanya untuk pembatalan karena maintenance yang sedang
     diproses atau baru saja direfund. Booking yang pernah dipindahkan
     (maintenanceState 'replaced') kembali ke kebijakan normal. */
  var maintenanceRefund = String(booking.maintenanceState || '') === 'choice_pending' ||
    (String((next && next.maintenanceState) || '') === 'refunded' &&
      String(schedule.maintenanceStatus || '') === 'active');
  var fullRefund = maintenanceRefund ||
    String(schedule.status || '') === 'cancelled' ||
    String(schedule.tripStatus || '') === 'cancelled';
  if (fullRefund) {
    return {
      pct: 100,
      amount: Math.max(0, apiSyncNumber_(booking.total, 0)),
      scope: 'total'
    };
  }
  var fare = booking.fare;
  var ticket = fare && isFinite(Number(fare.ticket)) && Number(fare.ticket) > 0
    ? Number(fare.ticket)
    : apiSyncSplitFare_(ctx, schedule, (booking.seats || []).length,
        booking.discount || 0, booking.source || '').ticket;
  var departure = apiSyncScheduleDepartureMs_(schedule);
  var hours = isFinite(departure) ? Math.max(0, (departure - Date.now()) / 36e5) : 0;
  var policy = apiSyncRefundPolicy_(ctx, schedule);
  var rule = policy[policy.length - 1];
  for (var i = 0; i < policy.length; i++) {
    if (hours >= policy[i].minH) { rule = policy[i]; break; }
  }
  return {
    pct: Math.max(0, Math.min(100, apiSyncNumber_(rule && rule.pct, 0))),
    amount: Math.round(Math.max(0, ticket) * Math.max(0, Math.min(100, apiSyncNumber_(rule && rule.pct, 0))) / 100),
    scope: 'ticket'
  };
}

function apiSyncVoucherDiscount_(ctx, schedule, seatCount, voucherCode) {
  var code = String(voucherCode || '').trim().toUpperCase();
  if (!code) return { ok: true, discount: 0, voucher: null };
  var vouchers = apiSyncEnsureCollection_(ctx, 'vouchers') || [];
  var voucher = null;
  for (var i = 0; i < vouchers.length; i++) {
    if (String(vouchers[i].code || '').toUpperCase() === code) {
      voucher = vouchers[i];
      break;
    }
  }
  if (!voucher) return { ok: false, msg: 'Voucher tidak ditemukan.' };
  if (!voucher.active) return { ok: false, msg: 'Voucher sudah tidak aktif.' };
  if (voucher.quota != null && apiSyncNumber_(voucher.used, 0) >= apiSyncNumber_(voucher.quota, 0)) {
    return { ok: false, msg: 'Kuota voucher sudah habis.' };
  }
  if (voucher.agencyId && String(voucher.agencyId) !== String(schedule.agencyId || '')) {
    return { ok: false, msg: 'Voucher tidak berlaku untuk agensi jadwal ini.' };
  }
  var subtotal = apiSyncNumber_(schedule.price, 0) * Math.max(1, apiSyncNumber_(seatCount, 1));
  var discount = String(voucher.type || '') === 'percent'
    ? Math.min(Math.round((subtotal * apiSyncNumber_(voucher.value, 0)) / 100), apiSyncNumber_(voucher.maxDisc, subtotal))
    : Math.min(apiSyncNumber_(voucher.value, 0), subtotal);
  return { ok: true, discount: Math.max(0, discount), voucher: voucher };
}

function apiSyncBookingTransitionAllowed_(from, to) {
  if (from === to) return true;
  var map = {
    pending: { paid: 1, cancelled: 1 },
    paid: { cancelled: 1, done: 1 },
    done: {},
    cancelled: {}
  };
  return !!(map[from] && map[from][to]);
}

function apiSyncLedgerTransitionAllowed_(from, to) {
  if (from === to) return true;
  var map = {
    ditahan: { layak: 1, void: 1 },
    layak: { dicairkan: 1, void: 1 },
    void: {},
    dicairkan: {}
  };
  return !!(map[from] && map[from][to]);
}

function apiSyncRequireAgency_(ctx, agencyId) {
  var id = String(agencyId || '');
  if (!id) throw apiError_('VALIDATION', 'agencyId wajib diisi.');
  var agency = apiSyncFind_(ctx, 'agencies', id);
  if (!agency) throw apiError_('VALIDATION', 'Agensi tidak ditemukan: ' + id);
  return agency;
}

function apiSyncValidateAgencyRef_(ctx, agencyId, label) {
  if (!agencyId) return null;
  return apiSyncRequireAgency_(ctx, agencyId);
}

/* ---------------------------- users ------------------------------- */

function apiSyncPrepareUsers_(ctx, cfg) {
  var target = ctx.changes.users;
  var currentMap = ctx.currentMap.users || {};
  var pendingMap = ctx.pending.users || {};
  var selfId = String(ctx.user.id || '');
  var role = ctx.role;

  function emailTaken(email, exceptId) {
    var needle = apiNormalizeEmail_(email);
    if (!needle) return false;
    var users = ctx.current.users || [];
    for (var i = 0; i < users.length; i++) {
      if (exceptId && String(users[i].id) === String(exceptId)) continue;
      if (apiNormalizeEmail_(users[i].email) === needle) return true;
    }
    var upserts = target.upserts || [];
    for (var u = 0; u < upserts.length; u++) {
      if (exceptId && String(upserts[u].id) === String(exceptId)) continue;
      if (apiNormalizeEmail_(upserts[u].email) === needle) return true;
    }
    return false;
  }

  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var isNew = !old;
    var hasPass = Object.prototype.hasOwnProperty.call(rec, 'pass') ||
      Object.prototype.hasOwnProperty.call(rec, 'password');
    var pass = hasPass ? String(rec.pass != null ? rec.pass : rec.password) : '';
    delete rec.pass;
    delete rec.password;
    if (hasPass && !pass) hasPass = false;

    if (ctx.pendingAgen) {
      if (!old || String(old.id) !== selfId) {
        throw apiError_('FORBIDDEN', 'Agen pending hanya boleh mengubah profil sendiri.');
      }
      if (hasPass) throw apiError_('FORBIDDEN', 'Ganti password lewat aksi changePassword.');
    } else if (role === 'superadmin') {
      if (isNew && String(rec.role || '') === 'superadmin') {
        throw apiError_('VALIDATION', 'Akun superadmin tidak boleh dibuat lewat sync.');
      }
    } else if (role === 'agen') {
      if (isNew) {
        if (String(rec.role || '') !== 'pengemudi') {
          throw apiError_('FORBIDDEN', 'Agen hanya boleh membuat akun pengemudi.');
        }
        if (String(rec.agencyId || '') !== String(ctx.user.agencyId || '')) {
          throw apiError_('FORBIDDEN', 'Pengemudi harus berada di agensi Anda.');
        }
        apiSyncRequireAgency_(ctx, rec.agencyId);
        if (!hasPass) throw apiError_('VALIDATION', 'Password pengemudi baru wajib diisi.');
      } else if (String(old.id) !== selfId &&
                 !(String(old.role || '') === 'pengemudi' &&
                   String(old.agencyId || '') === String(ctx.user.agencyId || ''))) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh mengelola akun pengemudi agensi sendiri.');
      } else if (String(old.id) === selfId && hasPass) {
        throw apiError_('FORBIDDEN', 'Ganti password sendiri lewat aksi changePassword.');
      }
    } else {
      if (!old || String(old.id) !== selfId) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh mengubah profil sendiri.');
      }
      if (hasPass) throw apiError_('FORBIDDEN', 'Ganti password lewat aksi changePassword.');
    }

    if (isNew) {
      if (emailTaken(rec.email, id)) throw apiError_('VALIDATION', 'Email sudah terdaftar.');
      if (!apiIsEmail_(rec.email)) throw apiError_('VALIDATION', 'Format email belum benar.');
      if (!String(rec.name || '').trim()) throw apiError_('VALIDATION', 'Nama wajib diisi.');
      if (apiPhoneDigits_(rec.phone).length < 9) {
        throw apiError_('VALIDATION', 'No HP minimal 9 digit angka.');
      }
      var newRole = String(rec.role || '');
      if (['agen', 'pengemudi', 'pelanggan'].indexOf(newRole) < 0) {
        throw apiError_('VALIDATION', 'Role akun tidak valid.');
      }
      var newStatus = String(rec.status || 'active');
      if (['active', 'pending', 'suspended'].indexOf(newStatus) < 0) {
        throw apiError_('VALIDATION', 'Status akun tidak valid.');
      }
      rec.status = newStatus;
      if (newRole === 'pelanggan') {
        rec.agencyId = null;
      } else {
        var agency = apiSyncRequireAgency_(ctx, rec.agencyId);
        if (newRole === 'agen') {
          var users = (ctx.current.users || []).concat(target.upserts || []);
          for (var au = 0; au < users.length; au++) {
            if (String(users[au].id) === id) continue;
            if (users[au].role === 'agen' && String(users[au].agencyId || '') === String(agency.id)) {
              throw apiError_('VALIDATION', 'Travel ini sudah punya akun agen.');
            }
          }
        }
        if (String(agency.status || '') === 'pending' && newStatus === 'active') {
          rec.status = 'pending';
        }
      }
      if (!hasPass) {
        throw apiError_('VALIDATION', 'Password akun baru wajib diisi.');
      }
      if (newRole === 'pelanggan' && !Array.isArray(rec.favorites)) rec.favorites = [];
      rec.tokenVersion = 0;
    } else {
      if (String(rec.role || '') !== String(old.role || '')) {
        throw apiError_('VALIDATION', 'Role akun tidak boleh diubah.');
      }
      if (String(rec.agencyId || '') !== String(old.agencyId || '')) {
        throw apiError_('VALIDATION', 'agencyId akun tidak boleh diubah.');
      }
      if (role !== 'superadmin' && apiNormalizeEmail_(rec.email) !== apiNormalizeEmail_(old.email)) {
        throw apiError_('VALIDATION', 'Email akun tidak boleh diubah.');
      }
      if (role === 'superadmin' && emailTaken(rec.email, id)) {
        throw apiError_('VALIDATION', 'Email sudah terdaftar.');
      }
      /* Salin secret lama dulu supaya perbandingan field tidak melihat
         passHash/tokenVersion yang memang tidak pernah dikirim klien. */
      apiCopyMissingSecrets_(rec, old);
      var allowedFields = {};
      if (role === 'superadmin') {
        allowedFields = {
          name: 1, phone: 1, wa: 1, photo: 1, address: 1, status: 1,
          email: 1, profileStep: 1, suspendedByParent: 1,
          parentSuspendedDriverStatus: 1
        };
      } else if (String(old.id) === selfId) {
        allowedFields = { name: 1, phone: 1, wa: 1, photo: 1, address: 1, profileStep: 1 };
        if (old.role === 'pelanggan') allowedFields.favorites = 1;
      } else {
        allowedFields = { name: 1, phone: 1, wa: 1, photo: 1, status: 1, profileStep: 1 };
      }
      var changed = apiSyncChangedFields_(rec, old);
      for (var c = 0; c < changed.length; c++) {
        if (!allowedFields[changed[c]]) {
          throw apiError_('FORBIDDEN', 'Field "' + changed[c] + '" tidak boleh diubah pada akun ini.');
        }
      }
      if (Object.prototype.hasOwnProperty.call(rec, 'status')) {
        var st = String(rec.status || '');
        if (['active', 'pending', 'suspended'].indexOf(st) < 0) {
          throw apiError_('VALIDATION', 'Status akun tidak valid.');
        }
      }
      apiCopyMissingSecrets_(rec, old);
    }

    if (hasPass) {
      if (pass.length < API_MIN_PASSWORD_LENGTH) {
        throw apiError_('VALIDATION', 'Password minimal ' + API_MIN_PASSWORD_LENGTH + ' karakter.');
      }
      apiHashForUser_(rec, pass, cfg);
      delete rec.pass;
      delete rec.password;
      rec.tokenVersion = old ? (Number(old.tokenVersion || 0) || 0) + 1 : 0;
    } else if (!isNew) {
      apiCopyMissingSecrets_(rec, old);
    }

    pendingMap[id] = rec;
  });

  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Akun tidak ditemukan: ' + id);
    if (ctx.pendingAgen) {
      throw apiError_('FORBIDDEN', 'Agen pending tidak boleh menghapus akun.');
    }
    if (role === 'superadmin') {
      if (id === selfId) throw apiError_('VALIDATION', 'Akun sendiri tidak boleh dihapus.');
    } else if (role === 'agen') {
      if (String(old.role || '') !== 'pengemudi' ||
          String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus akun pengemudi agensi sendiri.');
      }
      var driver = null;
      var drivers = (ctx.current.drivers || []).concat((ctx.changes.drivers && ctx.changes.drivers.upserts) || []);
      for (var dd = 0; dd < drivers.length; dd++) {
        if (apiNormalizeEmail_(drivers[dd].userEmail) === apiNormalizeEmail_(old.email)) {
          driver = drivers[dd];
          break;
        }
      }
      if (driver) {
        var schedules = (ctx.current.schedules || []).concat((ctx.changes.schedules && ctx.changes.schedules.upserts) || []);
        for (var ds = 0; ds < schedules.length; ds++) {
          var sc = schedules[ds];
          if (String(sc.driverId || '') !== String(driver.id) &&
              String(sc.backupDriverId || '') !== String(driver.id)) continue;
          if (String(sc.status || 'open') !== 'open') continue;
          if (String(sc.tripStatus || 'scheduled') === 'cancelled') continue;
          if (String(sc.date || '') >= apiTodayKey_()) {
            throw apiError_('VALIDATION', 'Pengemudi masih punya jadwal aktif.');
          }
        }
      }
    } else {
      throw apiError_('FORBIDDEN', 'Anda tidak boleh menghapus akun.');
    }
  });
}

/* ----------------------------- routes ----------------------------- */

/** Agen hanya boleh membersihkan penugasan pengemudi pada rute agensinya. */
function apiRouteAllowsAgency_(route, agencyId) {
  if (!route) return false;
  var ids = Array.isArray(route.agencyIds) ? route.agencyIds.map(String) : [];
  if (ids.length) return ids.indexOf(String(agencyId)) >= 0;
  if (route.agencyId) return String(route.agencyId) === String(agencyId);
  return true;
}

function apiSyncValidateRoutes_(ctx, target) {
  var currentMap = ctx.currentMap.routes || {};
  if (ctx.role === 'superadmin') return;
  if (ctx.role !== 'agen') {
    throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis rute.');
  }
  var ownAgency = String(ctx.user.agencyId || '');
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (!old) throw apiError_('FORBIDDEN', 'Agen tidak boleh membuat rute baru.');
    var routeAgencies = Array.isArray(old.agencyIds) ? old.agencyIds.map(String) : [];
    if (String(old.agencyId || '') !== ownAgency && routeAgencies.indexOf(ownAgency) < 0) {
      throw apiError_('FORBIDDEN', 'Rute ini bukan milik agensi Anda.');
    }
    var changed = apiSyncChangedFields_(rec, old);
    for (var i = 0; i < changed.length; i++) {
      if (changed[i] !== 'driverId' && changed[i] !== 'driverIds') {
        throw apiError_('FORBIDDEN', 'Agen hanya boleh mengubah penugasan pengemudi pada rute.');
      }
    }
    var beforeIds = Array.isArray(old.driverIds) ? old.driverIds.map(String) : [];
    var afterIds = Array.isArray(rec.driverIds) ? rec.driverIds.map(String) : [];
    var removed = [];
    var added = [];
    beforeIds.forEach(function (did) {
      if (afterIds.indexOf(did) < 0) removed.push(did);
    });
    afterIds.forEach(function (did) {
      if (beforeIds.indexOf(did) < 0) added.push(did);
    });
    removed.forEach(function (did) {
      var driver = (ctx.pending.drivers && ctx.pending.drivers[did]) ||
        (ctx.currentMap.drivers && ctx.currentMap.drivers[did]);
      if (!driver || String(driver.agencyId || '') !== ownAgency) {
        throw apiError_('FORBIDDEN', 'Agen hanya boleh mengubah pengemudi agensinya pada rute.');
      }
    });
    added.forEach(function (did) {
      var driver = apiSyncFind_(ctx, 'drivers', did);
      if (!driver || String(driver.agencyId || '') !== ownAgency) {
        throw apiError_('FORBIDDEN', 'Agen hanya boleh menambah pengemudi agensinya pada rute.');
      }
    });
    afterIds.forEach(function (did) {
      if (ctx.deleted.drivers && ctx.deleted.drivers[did]) {
        throw apiError_('VALIDATION', 'Rute masih merujuk pengemudi yang dihapus.');
      }
    });
    var nextMain = String(rec.driverId || '');
    if (nextMain && afterIds.indexOf(nextMain) < 0) {
      throw apiError_('VALIDATION', 'driverId rute harus ada di driverIds.');
    }
    if (nextMain && beforeIds.indexOf(nextMain) < 0) {
      var mainDriver = apiSyncFind_(ctx, 'drivers', nextMain);
      if (!mainDriver || String(mainDriver.agencyId || '') !== ownAgency) {
        throw apiError_('FORBIDDEN', 'Pengemudi utama rute harus dari agensi Anda.');
      }
    }
  });
  if (target.deletes && target.deletes.length) {
    throw apiError_('FORBIDDEN', 'Agen tidak boleh menghapus rute.');
  }
}

/* --------------------------- agencies ----------------------------- */

function apiSyncValidateAgencies_(ctx, target) {
  var currentMap = ctx.currentMap.agencies || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (ctx.pendingAgen) {
      if (!old || id !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Agen pending hanya boleh menyimpan KYC agensinya.');
      }
    }
    if (ctx.role === 'agen') {
      if (!old || id !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh mengubah agensi sendiri.');
      }
      var allowed = {
        name: 1, logo: 1, photo: 1, address: 1, phone: 1, wa: 1, email: 1,
        bank: 1, kyc: 1, description: 1
      };
      var changed = apiSyncChangedFields_(rec, old);
      for (var i = 0; i < changed.length; i++) {
        if (!allowed[changed[i]]) {
          throw apiError_('FORBIDDEN', 'Field agensi "' + changed[i] + '" tidak boleh diubah agen.');
        }
      }
      if (Object.prototype.hasOwnProperty.call(rec, 'status') &&
          String(rec.status || '') !== String(old.status || '')) {
        throw apiError_('FORBIDDEN', 'Status agensi hanya boleh diubah superadmin.');
      }
    } else if (ctx.role === 'superadmin') {
      if (!old) {
        if (!String(rec.name || '').trim()) throw apiError_('VALIDATION', 'Nama agensi wajib diisi.');
        var st = String(rec.status || 'pending');
        if (['active', 'pending', 'suspended'].indexOf(st) < 0) {
          throw apiError_('VALIDATION', 'Status agensi tidak valid.');
        }
        rec.status = st;
        if (!rec.feeType) rec.feeType = 'percent';
        if (rec.feeValue == null) rec.feeValue = 8;
        if (!Array.isArray(rec.refundPolicy)) rec.refundPolicy = API_DEFAULT_REFUND_POLICY;
      }
    }
  });
  (target.deletes || []).forEach(function (id) {
    if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Hanya superadmin yang boleh menghapus agensi.');
    }
    if (!currentMap[String(id)]) throw apiError_('NOT_FOUND', 'Agensi tidak ditemukan: ' + id);
  });
}

/* --------------------------- vehicles ----------------------------- */

function apiSyncValidateVehicles_(ctx, target) {
  var currentMap = ctx.currentMap.vehicles || {};
  var pendingMap = ctx.pending.vehicles || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var agencyId = String(rec.agencyId || (old && old.agencyId) || '');
    if (ctx.role === 'agen') {
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Armada harus berada di agensi Anda.');
      }
      if (old && String(old.agencyId || '') !== agencyId) {
        throw apiError_('FORBIDDEN', 'agencyId armada tidak boleh diubah.');
      }
    } else if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis armada.');
    }
    if (!old && !String(rec.plate || '').trim()) {
      throw apiError_('VALIDATION', 'Plat nomor armada wajib diisi.');
    }
    ['driverId', 'backDriverId', 'coopDriverId'].forEach(function (field) {
      var did = String(rec[field] || '');
      if (!did) return;
      var driver = apiSyncFind_(ctx, 'drivers', did);
      if (!driver) throw apiError_('VALIDATION', 'Pengemudi pada armada tidak ditemukan: ' + did);
      if (String(driver.agencyId || '') !== agencyId) {
        throw apiError_('VALIDATION', 'Pengemudi armada harus dari agensi yang sama.');
      }
    });
    if (old && JSON.stringify(rec.inactiveSeats || []) !== JSON.stringify(old.inactiveSeats || [])) {
      var schedules = (ctx.current.schedules || []).concat((ctx.changes.schedules && ctx.changes.schedules.upserts) || []);
      schedules.forEach(function (s) {
        if (String(s.vehicleId || '') === id) ctx.touchedSchedules[String(s.id)] = true;
      });
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Armada tidak ditemukan: ' + id);
    if (ctx.role !== 'superadmin' && String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus armada agensi sendiri.');
    }
    var schedules = (ctx.current.schedules || []).concat((ctx.changes.schedules && ctx.changes.schedules.upserts) || []);
    for (var i = 0; i < schedules.length; i++) {
      if (String(schedules[i].vehicleId || '') !== id) continue;
      if (String(schedules[i].status || '') === 'cancelled' ||
          String(schedules[i].tripStatus || '') === 'cancelled') continue;
      throw apiError_('VALIDATION', 'Armada masih dipakai jadwal aktif.');
    }
  });
}

/* ---------------------------- drivers ----------------------------- */

function apiSyncValidateDrivers_(ctx, target) {
  var currentMap = ctx.currentMap.drivers || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var agencyId = String(rec.agencyId || (old && old.agencyId) || '');
    if (ctx.role === 'agen') {
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Pengemudi harus berada di agensi Anda.');
      }
      if (old && String(old.agencyId || '') !== agencyId) {
        throw apiError_('FORBIDDEN', 'agencyId pengemudi tidak boleh diubah.');
      }
    } else if (ctx.role === 'pengemudi') {
      var selfEmail = apiNormalizeEmail_(ctx.user.email);
      if (old) {
        if (String(old.id) !== String(ctx.ownDriverId || '')) {
          throw apiError_('FORBIDDEN', 'Anda hanya boleh mengubah data pengemudi sendiri.');
        }
        /* Email penaut harus tetap milik akun ini; jangan sampai pengemudi
           memindahkan record ke email pengemudi lain lalu mendapat aksesnya. */
        if (apiNormalizeEmail_(rec.userEmail) !== selfEmail) {
          throw apiError_('FORBIDDEN', 'Email pengemudi tidak boleh diubah.');
        }
        var driverSelfAllowed = {
          phone: 1, address: 1, emName: 1, emPhone: 1, emRelation: 1,
          bank: 1, photo: 1, wa: 1, pendingProfile: 1, pendingAt: 1, updatedAt: 1
        };
        var driverSelfChanged = apiSyncChangedFields_(rec, old);
        for (var dsc = 0; dsc < driverSelfChanged.length; dsc++) {
          if (!Object.prototype.hasOwnProperty.call(driverSelfAllowed, driverSelfChanged[dsc])) {
            throw apiError_('FORBIDDEN', 'Field pengemudi "' + driverSelfChanged[dsc] + '" tidak boleh diubah sendiri.');
          }
        }
      } else {
        if (ctx.ownDriverId) {
          throw apiError_('FORBIDDEN', 'Akun ini sudah punya data pengemudi.');
        }
        if (apiNormalizeEmail_(rec.userEmail) !== selfEmail) {
          throw apiError_('FORBIDDEN', 'Data pengemudi baru harus memakai email akun Anda.');
        }
      }
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'agencyId pengemudi tidak valid.');
      }
    } else if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis pengemudi.');
    }
    var email = apiNormalizeEmail_(rec.userEmail);
    if (email) {
      var user = apiSyncFindUserByEmail_(ctx, email);
      if (!user || String(user.role || '') !== 'pengemudi') {
        throw apiError_('VALIDATION', 'Email pengemudi belum punya akun pengemudi.');
      }
      if (String(user.agencyId || '') !== agencyId) {
        throw apiError_('VALIDATION', 'Akun pengemudi harus berada di agensi yang sama.');
      }
    }
    if (!old && !String(rec.name || '').trim()) {
      throw apiError_('VALIDATION', 'Nama pengemudi wajib diisi.');
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Pengemudi tidak ditemukan: ' + id);
    if (ctx.role === 'pengemudi') {
      throw apiError_('FORBIDDEN', 'Pengemudi tidak boleh menghapus data sendiri.');
    }
    if (ctx.role !== 'superadmin' && String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus pengemudi agensi sendiri.');
    }
    var linkedVehicles = apiSyncMergeList_(ctx, 'vehicles');
    for (var lv = 0; lv < linkedVehicles.length; lv++) {
      var vehicle = linkedVehicles[lv] || {};
      if (String(vehicle.driverId || '') === id ||
          String(vehicle.backDriverId || '') === id ||
          String(vehicle.coopDriverId || '') === id) {
        throw apiError_('VALIDATION', 'Pengemudi masih terpasang di armada.');
      }
    }
    var schedules = (ctx.current.schedules || []).concat((ctx.changes.schedules && ctx.changes.schedules.upserts) || []);
    for (var i = 0; i < schedules.length; i++) {
      var s = schedules[i];
      if (String(s.driverId || '') !== id && String(s.backupDriverId || '') !== id) continue;
      if (String(s.status || 'open') !== 'open') continue;
      if (String(s.tripStatus || 'scheduled') === 'cancelled') continue;
      if (String(s.date || '') >= apiTodayKey_()) {
        throw apiError_('VALIDATION', 'Pengemudi masih punya jadwal aktif.');
      }
    }
  });
}

/* --------------------------- schedules ---------------------------- */

function apiSyncValidateSchedules_(ctx, target) {
  var currentMap = ctx.currentMap.schedules || {};
  var driverAllowed = {
    status: 1, tripStatus: 1, departedAt: 1, departedBy: 1, earlyStartReason: 1,
    arrivedAt: 1, lateCompletion: 1,
    delayUntil: 1, delayReason: 1, delayNote: 1, delayMinutes: 1,
    delayAddedMinutes: 1, delayedAt: 1, delayedBy: 1, tripDelayUpdatedAt: 1,
    delayHistory: 1, tripDelayInfo: 1, seatBlockLog: 1, blockedSeats: 1,
    cancelReason: 1, cancelledAt: 1, cancelledBy: 1, reviewedAt: 1,
    reviewResult: 1, refundPct: 1
  };
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var agencyId = String(rec.agencyId || (old && old.agencyId) || '');
    if (ctx.role === 'agen') {
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Jadwal harus berada di agensi Anda.');
      }
      if (old && String(old.agencyId || '') !== agencyId) {
        throw apiError_('FORBIDDEN', 'agencyId jadwal tidak boleh diubah.');
      }
    } else if (ctx.role === 'pengemudi') {
      if (!old || (String(old.driverId || '') !== String(ctx.ownDriverId || '') &&
                   String(old.backupDriverId || '') !== String(ctx.ownDriverId || ''))) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh mengubah jadwal yang ditugaskan.');
      }
      var changed = apiSyncChangedFields_(rec, old);
      for (var c = 0; c < changed.length; c++) {
        if (!driverAllowed[changed[c]]) {
          throw apiError_('FORBIDDEN', 'Field jadwal "' + changed[c] + '" tidak boleh diubah pengemudi.');
        }
      }
    } else if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis jadwal.');
    }
    var vehicle = apiSyncFind_(ctx, 'vehicles', rec.vehicleId);
    if (!vehicle) throw apiError_('VALIDATION', 'Armada jadwal tidak ditemukan.');
    if (String(vehicle.agencyId || '') !== agencyId) {
      throw apiError_('VALIDATION', 'Armada jadwal harus dari agensi yang sama.');
    }
    var route = apiSyncFind_(ctx, 'routes', rec.routeId);
    if (!route) throw apiError_('VALIDATION', 'Rute jadwal tidak ditemukan.');
    if (ctx.role === 'agen' && !apiRouteAllowsAgency_(route, agencyId)) {
      throw apiError_('FORBIDDEN', 'Rute jadwal tidak tersedia untuk agensi Anda.');
    }
    ['driverId', 'backupDriverId'].forEach(function (field) {
      var did = String(rec[field] || '');
      if (!did) return;
      var driver = apiSyncFind_(ctx, 'drivers', did);
      if (!driver) throw apiError_('VALIDATION', 'Pengemudi jadwal tidak ditemukan: ' + did);
      if (String(driver.agencyId || '') !== agencyId) {
        throw apiError_('VALIDATION', 'Pengemudi jadwal harus dari agensi yang sama.');
      }
    });
    ctx.touchedSchedules[id] = true;
  });
  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Jadwal tidak ditemukan: ' + id);
    if (ctx.role === 'pengemudi') {
      throw apiError_('FORBIDDEN', 'Pengemudi tidak boleh menghapus jadwal.');
    }
    if (ctx.role !== 'superadmin' && String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus jadwal agensi sendiri.');
    }
    var bookings = (ctx.current.bookings || []).concat((ctx.changes.bookings && ctx.changes.bookings.upserts) || []);
    for (var b = 0; b < bookings.length; b++) {
      if (String(bookings[b].scheduleId || '') !== id) continue;
      if (String(bookings[b].status || '') === 'cancelled') continue;
      throw apiError_('VALIDATION', 'Jadwal masih punya booking aktif.');
    }
  });
}

/* ------------------------ maintenance ----------------------------- */

function apiSyncValidateMaintenance_(ctx, target) {
  var currentMap = ctx.currentMap.maintenanceRequests || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var agencyId = String(rec.agencyId || (old && old.agencyId) || '');
    if (ctx.role === 'agen') {
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Maintenance harus berada di agensi Anda.');
      }
      if (old && String(old.agencyId || '') !== agencyId) {
        throw apiError_('FORBIDDEN', 'agencyId maintenance tidak boleh diubah.');
      }
    } else if (ctx.role === 'pengemudi') {
      if (String(rec.driverId || (old && old.driverId) || '') !== String(ctx.ownDriverId || '')) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh mengubah maintenance sendiri.');
      }
      if (old) {
        /* Pengemudi hanya boleh membatalkan pengajuan yang masih menunggu;
           keputusan setuju/tolak tetap milik agen. */
        if (String(old.status || '') !== 'menunggu' || String(rec.status || '') !== 'dibatalkan') {
          throw apiError_('FORBIDDEN', 'Pengemudi hanya boleh membatalkan pengajuan maintenance yang masih menunggu.');
        }
        var maintSelfAllowed = { status: 1, decidedAt: 1, decidedBy: 1, decisionNote: 1, updatedAt: 1 };
        var maintSelfChanged = apiSyncChangedFields_(rec, old);
        for (var msc = 0; msc < maintSelfChanged.length; msc++) {
          if (!Object.prototype.hasOwnProperty.call(maintSelfAllowed, maintSelfChanged[msc])) {
            throw apiError_('FORBIDDEN', 'Field maintenance "' + maintSelfChanged[msc] + '" tidak boleh diubah pengemudi.');
          }
        }
      } else if (String(rec.status || '') !== 'menunggu') {
        throw apiError_('VALIDATION', 'Pengajuan maintenance baru harus berstatus menunggu.');
      }
      if (agencyId !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Maintenance harus berada di agensi Anda.');
      }
      if (old && String(old.agencyId || '') !== agencyId) {
        throw apiError_('FORBIDDEN', 'agencyId maintenance tidak boleh diubah.');
      }
    } else if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis maintenance.');
    }
    var vehicle = apiSyncFind_(ctx, 'vehicles', rec.vehicleId);
    if (!vehicle) throw apiError_('VALIDATION', 'Armada maintenance tidak ditemukan.');
    if (String(vehicle.agencyId || '') !== agencyId) {
      throw apiError_('VALIDATION', 'Armada maintenance harus dari agensi yang sama.');
    }
    if (ctx.role === 'pengemudi' && !old) {
      var ownDriver = String(ctx.ownDriverId || '');
      var assignedToDriver = !!ownDriver &&
        (String(vehicle.driverId || '') === ownDriver ||
         String(vehicle.backDriverId || '') === ownDriver ||
         String(vehicle.coopDriverId || '') === ownDriver);
      if (!assignedToDriver) {
        var vehicleSchedules = ctx.current.schedules || [];
        for (var vs = 0; vs < vehicleSchedules.length; vs++) {
          var vsRec = vehicleSchedules[vs] || {};
          if (String(vsRec.vehicleId || '') !== String(vehicle.id || '')) continue;
          if (String(vsRec.driverId || '') === ownDriver ||
              String(vsRec.backupDriverId || '') === ownDriver) {
            assignedToDriver = true;
            break;
          }
        }
      }
      if (!assignedToDriver) {
        throw apiError_('FORBIDDEN', 'Armada ini bukan armada yang Anda kemudikan.');
      }
    }
    if (rec.driverId) {
      var driver = apiSyncFind_(ctx, 'drivers', rec.driverId);
      if (!driver) throw apiError_('VALIDATION', 'Pengemudi maintenance tidak ditemukan.');
      if (String(driver.agencyId || '') !== agencyId) {
        throw apiError_('VALIDATION', 'Pengemudi maintenance harus dari agensi yang sama.');
      }
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Maintenance tidak ditemukan: ' + id);
    if (ctx.role === 'pengemudi') {
      throw apiError_('FORBIDDEN', 'Pengemudi tidak boleh menghapus maintenance.');
    }
    if (ctx.role !== 'superadmin' && String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus maintenance agensi sendiri.');
    }
  });
}

/* --------------------------- bookings ----------------------------- */

function apiSyncBookingAccess_(ctx, booking, schedule, old) {
  if (ctx.role === 'superadmin') return true;
  if (ctx.pendingAgen) return false;
  if (!booking || !schedule) return false;
  if (ctx.role === 'pelanggan') {
    if (apiNormalizeEmail_(booking.userEmail) !== apiNormalizeEmail_(ctx.user.email)) return false;
    if (old && apiNormalizeEmail_(old.userEmail) !== apiNormalizeEmail_(ctx.user.email)) return false;
    return true;
  }
  if (ctx.role === 'agen') {
    if (String(schedule.agencyId || '') !== String(ctx.user.agencyId || '')) return false;
    if (old) {
      var oldSchedule = apiSyncFind_(ctx, 'schedules', old.scheduleId);
      if (!oldSchedule || String(oldSchedule.agencyId || '') !== String(ctx.user.agencyId || '')) return false;
    }
    return true;
  }
  if (ctx.role === 'pengemudi') {
    var own = String(ctx.ownDriverId || '');
    if (!own) return false;
    if (String(schedule.driverId || '') !== own && String(schedule.backupDriverId || '') !== own) return false;
    if (old) {
      var oldSchedule = apiSyncFind_(ctx, 'schedules', old.scheduleId);
      if (!oldSchedule ||
          (String(oldSchedule.driverId || '') !== own && String(oldSchedule.backupDriverId || '') !== own)) return false;
    }
    return true;
  }
  return false;
}

function apiSyncValidateBookings_(ctx, target) {
  var currentMap = ctx.currentMap.bookings || {};
  var allowedExisting = {
    status: 1, tripStatus: 1, paidAt: 1, holdExpiry: 1,
    fare: 1, rating: 1,
    boarded: 1, scheduleId: 1, seats: 1, passengers: 1, pickupCoords: 1,
    refundPct: 1, refundAmount: 1, refundScope: 1, refundStatus: 1, refundPaidAt: 1,
    cancelReason: 1, cancelledBy: 1, cancelledAt: 1,
    maintenanceState: 1, maintenanceResolvedAt: 1, maintenanceChoiceDeadline: 1,
    maintenanceOriginalScheduleId: 1, maintenanceRequestId: 1, maintenanceFrom: 1,
    maintenanceUntil: 1, maintenanceRefundAmount: 1,
    replacementScheduleId: 1, replacementAt: 1, replacementBy: 1
  };
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    var schedule = apiSyncFind_(ctx, 'schedules', rec.scheduleId);
    if (!schedule) throw apiError_('VALIDATION', 'Jadwal booking tidak ditemukan.');
    if (!apiSyncBookingAccess_(ctx, rec, schedule, old)) {
      throw apiError_('FORBIDDEN', 'Booking ini bukan milik Anda.');
    }
    var status = String(rec.status || '');
    var seats = Array.isArray(rec.seats) ? rec.seats.map(String) : [];
    if (['pending', 'paid', 'done'].indexOf(status) >= 0) {
      if (!seats.length) throw apiError_('VALIDATION', 'Booking aktif harus punya kursi.');
      var seen = {};
      for (var s = 0; s < seats.length; s++) {
        if (seen[seats[s]]) throw apiError_('VALIDATION', 'Kursi booking duplikat: ' + seats[s]);
        seen[seats[s]] = true;
      }
    }

    if (!old && ctx.role !== 'superadmin') {
      var allowedNewBooking = {
        id: 1, code: 1, scheduleId: 1, userEmail: 1, userPhone: 1,
        seats: 1, passengers: 1, pickupCoords: 1, subtotal: 1, discount: 1,
        total: 1, status: 1, payMethod: 1, voucher: 1, source: 1,
        createdBy: 1, createdAt: 1, paidAt: 1, holdExpiry: 1,
        tripStatus: 1, boarded: 1
      };
      apiSyncRejectUnknownFields_(rec, allowedNewBooking, 'booking baru');
      if (ctx.role === 'pelanggan' && String(rec.createdBy || '')) {
        throw apiError_('FORBIDDEN', 'Booking pelanggan tidak boleh mengisi createdBy.');
      }
      /* Field operasional ini hanya boleh muncul lewat alur setelah booking
         dibuat; jangan percaya nilai awal dari klien. */
      rec.paidAt = null;
      rec.boarded = false;
      rec.tripStatus = 'scheduled';
      /* Hold selalu ditentukan server: klien tidak boleh mengunci kursi
         dengan holdExpiry jauh di masa depan. */
      rec.holdExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      if (ctx.role === 'agen') {
        throw apiError_('FORBIDDEN', 'Agen tidak boleh membuat booking baru.');
      }
      if (!apiSyncScheduleBookable_(schedule)) {
        throw apiError_('VALIDATION', 'Jadwal sudah lewat/tidak bisa dipesan.');
      }
      if (ctx.role === 'pelanggan') {
        if (apiNormalizeEmail_(rec.userEmail) !== apiNormalizeEmail_(ctx.user.email)) {
          throw apiError_('FORBIDDEN', 'Booking baru harus atas nama akun Anda.');
        }
        if (String(rec.source || '') === 'driver') {
          throw apiError_('FORBIDDEN', 'Booking pelanggan tidak boleh bertanda driver.');
        }
      } else if (ctx.role === 'pengemudi') {
        if (String(rec.userEmail || '')) {
          throw apiError_('FORBIDDEN', 'Booking driver tidak boleh memakai email pelanggan.');
        }
        if (String(rec.source || '') !== 'driver') {
          throw apiError_('FORBIDDEN', 'Booking pengemudi harus bertanda driver.');
        }
        if (String(rec.createdBy || '') !== String(ctx.ownDriverId || '')) {
          throw apiError_('FORBIDDEN', 'Booking harus dibuat oleh pengemudi sendiri.');
        }
      }
      if (status !== 'pending') {
        throw apiError_('VALIDATION', 'Booking baru harus berstatus pending.');
      }
      if (!Array.isArray(rec.passengers) || rec.passengers.length !== seats.length) {
        throw apiError_('VALIDATION', 'Jumlah penumpang harus sama dengan jumlah kursi.');
      }
      for (var p = 0; p < rec.passengers.length; p++) {
        if (seats.indexOf(String((rec.passengers[p] || {}).seat || '')) < 0) {
          throw apiError_('VALIDATION', 'Kursi penumpang tidak sesuai dengan kursi booking.');
        }
      }
      var subtotal = apiSyncNumber_(rec.subtotal, NaN);
      var discount = apiSyncNumber_(rec.discount, 0);
      var total = apiSyncNumber_(rec.total, NaN);
      var expectedSubtotal = apiSyncNumber_(schedule.price, 0) * seats.length;
      if (!isFinite(subtotal) || !isFinite(discount) || !isFinite(total)) {
        throw apiError_('VALIDATION', 'Nominal booking tidak valid.');
      }
      if (Math.abs(subtotal - expectedSubtotal) > 0.5) {
        throw apiError_('VALIDATION', 'Subtotal booking tidak sesuai harga jadwal.');
      }
      if (discount < 0 || discount > subtotal) {
        throw apiError_('VALIDATION', 'Diskon booking tidak valid.');
      }
      if (Math.abs(total - (subtotal - discount)) > 0.5) {
        throw apiError_('VALIDATION', 'Total booking tidak sesuai subtotal dan diskon.');
      }
      var voucherCheck = apiSyncVoucherDiscount_(ctx, schedule, seats.length, rec.voucher);
      if (!voucherCheck.ok) {
        throw apiError_('VALIDATION', voucherCheck.msg || 'Voucher booking tidak valid.');
      }
      if (Math.abs(apiSyncNumber_(voucherCheck.discount, 0) - discount) > 0.5) {
        throw apiError_('VALIDATION', 'Diskon tidak sesuai aturan voucher.');
      }
      if (ctx.role === 'pengemudi' && String(rec.voucher || '')) {
        throw apiError_('FORBIDDEN', 'Booking driver tidak boleh memakai voucher.');
      }
    }

    if (old && ctx.role !== 'superadmin') {
      var changed = apiSyncChangedFields_(rec, old);
      for (var c = 0; c < changed.length; c++) {
        if (!allowedExisting[changed[c]]) {
          throw apiError_('FORBIDDEN', 'Field booking "' + changed[c] + '" tidak boleh diubah.');
        }
      }
      var oldStatus = String(old.status || '');
      var newStatus = String(rec.status || '');
      if (changed.indexOf('holdExpiry') >= 0) {
        /* Hold tidak boleh diperpanjang/dihapus oleh klien saat masih pending.
           Null hanya boleh menyertai transisi keluar dari pending. */
        if (Date.parse(old.holdExpiry)) {
          if (Date.parse(rec.holdExpiry) &&
              Math.abs(Date.parse(rec.holdExpiry) - Date.parse(old.holdExpiry)) > 60000) {
            throw apiError_('FORBIDDEN', 'Hold booking tidak boleh diperpanjang.');
          }
          if (!Date.parse(rec.holdExpiry) && ['paid', 'cancelled', 'done'].indexOf(newStatus) < 0) {
            throw apiError_('FORBIDDEN', 'Hold booking tidak boleh dihapus saat pending.');
          }
        } else if (Date.parse(rec.holdExpiry) &&
                   (Date.parse(rec.holdExpiry) < Date.now() ||
                     Date.parse(rec.holdExpiry) > Date.now() + 20 * 60 * 1000)) {
          throw apiError_('VALIDATION', 'Hold booking baru tidak valid.');
        }
      }
      if (!apiSyncBookingTransitionAllowed_(oldStatus, newStatus)) {
        throw apiError_('FORBIDDEN', 'Perubahan status booking tidak diizinkan.');
      }
      if (oldStatus === 'pending' && newStatus === 'paid' &&
          Date.parse(old.holdExpiry) && Date.parse(old.holdExpiry) <= Date.now()) {
        throw apiError_('FORBIDDEN', 'Hold booking sudah kedaluwarsa.');
      }
      var scheduleChanged = String(rec.scheduleId || '') !== String(old.scheduleId || '');
      var seatsChanged = JSON.stringify(rec.seats || []) !== JSON.stringify(old.seats || []);
      if ((scheduleChanged || seatsChanged) &&
          !(String(old.maintenanceState || '') === 'choice_pending' &&
            String(rec.maintenanceState || '') === 'replaced')) {
        throw apiError_('FORBIDDEN', 'Jadwal/kursi booking hanya boleh berubah lewat pemindahan maintenance.');
      }
      if (changed.indexOf('refundStatus') >= 0 &&
          ['done', 'diproses'].indexOf(String(rec.refundStatus || '')) >= 0) {
        throw apiError_('FORBIDDEN', 'Status refund hanya boleh diubah admin.');
      }
      if (changed.indexOf('refundPaidAt') >= 0 && rec.refundPaidAt) {
        throw apiError_('FORBIDDEN', 'Tanggal refund dibayar hanya boleh diisi admin.');
      }
      var refundChanged = ['refundAmount', 'refundPct', 'refundScope', 'refundStatus', 'refundPaidAt']
        .some(function (field) { return changed.indexOf(field) >= 0; });
      if (refundChanged) {
        var refundAmount = apiSyncNumber_(rec.refundAmount, 0);
        var refundPct = apiSyncNumber_(rec.refundPct, 0);
        if (refundAmount < 0 || refundPct < 0 || refundPct > 100) {
          throw apiError_('VALIDATION', 'Nominal/persentase refund booking tidak valid.');
        }
        if (newStatus !== 'cancelled' && oldStatus !== 'cancelled') {
          throw apiError_('FORBIDDEN', 'Refund hanya boleh diubah saat pembatalan.');
        }
        if (oldStatus === 'cancelled') {
          if (refundAmount > apiSyncNumber_(old.refundAmount, 0) ||
              refundPct > apiSyncNumber_(old.refundPct, 0)) {
            throw apiError_('FORBIDDEN', 'Refund booking yang sudah dibatalkan tidak boleh dinaikkan.');
          }
        } else {
          var expectedRefund = apiSyncRefundExpectation_(ctx, old, schedule, rec);
          if (refundAmount > expectedRefund.amount + 0.5 ||
              refundPct > expectedRefund.pct + 0.5) {
            throw apiError_('FORBIDDEN', 'Refund melebihi kebijakan pembatalan.');
          }
        }
        if (ctx.role === 'pengemudi' &&
            String(schedule.status || '') !== 'cancelled' &&
            String(schedule.tripStatus || '') !== 'cancelled') {
          throw apiError_('FORBIDDEN', 'Pengemudi hanya boleh memproses refund lewat pembatalan jadwal.');
        }
      }
    }

    ctx.touchedSchedules[String(schedule.id)] = true;
    if (old) ctx.touchedSchedules[String(old.scheduleId)] = true;
  });
  (target.deletes || []).forEach(function (rawId) {
    var id = String(rawId);
    var old = currentMap[id];
    if (!old) throw apiError_('NOT_FOUND', 'Booking tidak ditemukan: ' + id);
    if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Booking tidak boleh dihapus.');
    }
    var schedule = apiSyncFind_(ctx, 'schedules', old.scheduleId);
    if (!apiSyncBookingAccess_(ctx, old, schedule, old)) {
      throw apiError_('FORBIDDEN', 'Booking ini bukan milik Anda.');
    }
    ctx.touchedSchedules[String(old.scheduleId)] = true;
  });
}

function apiSyncValidatePayments_(ctx, target) {
  var currentMap = ctx.currentMap.payments || {};
  function check(rec, old) {
    var recId = apiRecordId_(rec);
    var booking = apiSyncFind_(ctx, 'bookings', rec.bookingId);
    if (!booking) throw apiError_('VALIDATION', 'Booking pembayaran tidak ditemukan.');
    var schedule = apiSyncFind_(ctx, 'schedules', booking.scheduleId);
    if (!apiSyncBookingAccess_(ctx, booking, schedule, null)) {
      throw apiError_('FORBIDDEN', 'Pembayaran ini bukan milik Anda.');
    }
    if (old) {
      var oldBooking = apiSyncFind_(ctx, 'bookings', old.bookingId);
      var oldSchedule = oldBooking ? apiSyncFind_(ctx, 'schedules', oldBooking.scheduleId) : null;
      if (!apiSyncBookingAccess_(ctx, oldBooking, oldSchedule, null)) {
        throw apiError_('FORBIDDEN', 'Pembayaran ini bukan milik Anda.');
      }
    }
    var amount = apiSyncNumber_(rec.amount, NaN);
    if (!isFinite(amount) || amount < 0) {
      throw apiError_('VALIDATION', 'Nominal pembayaran tidak valid.');
    }

    if (!old) {
      if (ctx.role === 'superadmin') return;
      apiSyncRejectUnknownFields_(rec, {
        id: 1, bookingId: 1, amount: 1, method: 1, status: 1, time: 1, fee: 1
      }, 'pembayaran baru');
      if (ctx.role === 'agen') {
        throw apiError_('FORBIDDEN', 'Agen tidak boleh membuat pembayaran baru.');
      }
      if (ctx.role === 'pengemudi' && String(booking.userEmail || '')) {
        throw apiError_('FORBIDDEN', 'Pengemudi hanya boleh membuat pembayaran untuk booking driver.');
      }
      if (String(rec.status || '') !== 'pending') {
        throw apiError_('VALIDATION', 'Pembayaran baru harus berstatus pending.');
      }
      if (Math.abs(amount - apiSyncNumber_(booking.total, 0)) > 0.5) {
        throw apiError_('VALIDATION', 'Nominal pembayaran harus sama dengan total booking.');
      }
      var newFee = apiSyncNumber_(rec.fee, 0);
      if (newFee < 0 || newFee > amount) {
        throw apiError_('VALIDATION', 'Fee pembayaran tidak valid.');
      }
      var newFare = apiSyncSplitFare_(ctx, schedule, (booking.seats || []).length,
        booking.discount || 0, booking.source || '');
      if (Math.abs(newFee - apiSyncNumber_(newFare.fee, 0)) > 0.5) {
        throw apiError_('VALIDATION', 'Fee pembayaran tidak sesuai perhitungan.');
      }
      var payList = (ctx.current.payments || []).concat(
        (ctx.changes.payments && ctx.changes.payments.upserts) || []
      );
      for (var pi = 0; pi < payList.length; pi++) {
        if (apiRecordId_(payList[pi]) === recId) continue;
        if (String(payList[pi].bookingId || '') === String(rec.bookingId || '')) {
          throw apiError_('VALIDATION', 'Booking ini sudah punya pembayaran.');
        }
      }
      return;
    }

    if (ctx.role === 'superadmin') return;
    if (!apiSyncSameExcept_(rec, old, {
      status: 1, fee: 1, refundAmount: 1, refundPct: 1, refundScope: 1,
      refundStatus: 1, refundRequestedAt: 1, refundedAt: 1, refundPaidAt: 1,
      refundProcessedAt: 1
    })) {
      throw apiError_('FORBIDDEN', 'Hanya status/fee/refund pembayaran yang boleh diubah.');
    }
    var oldStatus = String(old.status || '');
    var newStatus = String(rec.status || '');
    if (newStatus !== oldStatus) {
      var transitions = {
        pending: { paid: 1, cancelled: 1 },
        paid: {},
        cancelled: {},
        refunded: {}
      };
      if (!(transitions[oldStatus] && transitions[oldStatus][newStatus])) {
        throw apiError_('FORBIDDEN', 'Perubahan status pembayaran tidak diizinkan.');
      }
    }
    if (newStatus === 'paid' && String(booking.status || '') !== 'paid') {
      throw apiError_('VALIDATION', 'Pembayaran lunas harus disertai booking lunas.');
    }
    var fee = apiSyncNumber_(rec.fee, 0);
    if (fee < 0 || fee > amount) {
      throw apiError_('VALIDATION', 'Fee pembayaran tidak valid.');
    }
    var changed = apiSyncChangedFields_(rec, old);
    if (changed.indexOf('fee') >= 0) {
      if (oldStatus !== 'pending') {
        throw apiError_('FORBIDDEN', 'Fee pembayaran hanya boleh diubah saat pending.');
      }
      var existingFare = apiSyncSplitFare_(ctx, schedule, (booking.seats || []).length,
        booking.discount || 0, booking.source || '');
      if (Math.abs(fee - apiSyncNumber_(existingFare.fee, 0)) > 0.5) {
        throw apiError_('VALIDATION', 'Fee pembayaran tidak sesuai perhitungan.');
      }
    }
    if (changed.indexOf('refundAmount') >= 0) {
      var refundAmount = apiSyncNumber_(rec.refundAmount, 0);
      if (refundAmount < 0 || refundAmount > apiSyncNumber_(booking.total, 0)) {
        throw apiError_('VALIDATION', 'Nominal refund pembayaran tidak valid.');
      }
    }
    if (changed.indexOf('refundPct') >= 0) {
      var refundPct = apiSyncNumber_(rec.refundPct, 0);
      if (refundPct < 0 || refundPct > 100) {
        throw apiError_('VALIDATION', 'Persentase refund pembayaran tidak valid.');
      }
    }
    if (changed.indexOf('refundStatus') >= 0 &&
        ['done', 'diproses'].indexOf(String(rec.refundStatus || '')) >= 0) {
      throw apiError_('FORBIDDEN', 'Status refund hanya boleh diubah admin.');
    }
    if ((changed.indexOf('refundPaidAt') >= 0 && rec.refundPaidAt) ||
        (changed.indexOf('refundedAt') >= 0 && rec.refundedAt) ||
        (changed.indexOf('refundProcessedAt') >= 0 && rec.refundProcessedAt)) {
      throw apiError_('FORBIDDEN', 'Penyelesaian refund hanya boleh diisi admin.');
    }
    var paymentRefundChanged = ['refundAmount', 'refundPct', 'refundScope', 'refundStatus']
      .some(function (field) { return changed.indexOf(field) >= 0; });
    if (paymentRefundChanged) {
      if (String(booking.status || '') !== 'cancelled') {
        throw apiError_('FORBIDDEN', 'Refund pembayaran hanya boleh diubah saat booking dibatalkan.');
      }
      if (apiSyncNumber_(rec.refundAmount, 0) > apiSyncNumber_(booking.refundAmount, 0) + 0.5 ||
          apiSyncNumber_(rec.refundPct, 0) > apiSyncNumber_(booking.refundPct, 0) + 0.5) {
        throw apiError_('FORBIDDEN', 'Refund pembayaran melebihi refund booking.');
      }
    }
  }
  (target.upserts || []).forEach(function (rec) {
    check(rec, currentMap[apiRecordId_(rec)] || null);
  });
  (target.deletes || []).forEach(function (rawId) {
    var old = currentMap[String(rawId)];
    if (!old) throw apiError_('NOT_FOUND', 'Pembayaran tidak ditemukan: ' + rawId);
    if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Pembayaran tidak boleh dihapus.');
    }
    check(old, old);
  });
}

function apiSyncValidateLedger_(ctx, target) {
  var currentMap = ctx.currentMap.ledger || {};
  function check(entry, old) {
    var entryId = apiRecordId_(entry);
    var booking = entry.bookingId ? apiSyncFind_(ctx, 'bookings', entry.bookingId) : null;
    var schedule = booking ? apiSyncFind_(ctx, 'schedules', booking.scheduleId) : null;
    if (booking) {
      if (!apiSyncBookingAccess_(ctx, booking, schedule, null)) {
        throw apiError_('FORBIDDEN', 'Ledger ini bukan milik Anda.');
      }
    } else if (ctx.role !== 'superadmin') {
      throw apiError_('VALIDATION', 'Ledger harus terhubung ke booking.');
    }
    if (ctx.role === 'agen' && booking && String(entry.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Ledger harus berada di agensi Anda.');
    }
    if (old && String(old.bookingId || '') !== String(entry.bookingId || '') && ctx.role !== 'superadmin') {
      throw apiError_('VALIDATION', 'bookingId ledger tidak boleh diubah.');
    }

    if (!old) {
      if (ctx.role === 'superadmin') return;
      apiSyncRejectUnknownFields_(entry, {
        id: 1, agencyId: 1, bookingId: 1, scheduleId: 1, driverId: 1,
        userEmail: 1, seats: 1, ticket: 1, service: 1, fee: 1, total: 1,
        status: 1, createdAt: 1, releasedAt: 1, paidOutAt: 1
      }, 'ledger baru');
      if (entry.paidOutAt) {
        throw apiError_('FORBIDDEN', 'Pencairan ledger hanya boleh dilakukan admin.');
      }
      if (!booking || String(booking.status || '') !== 'paid') {
        throw apiError_('VALIDATION', 'Ledger hanya boleh dibuat untuk booking lunas.');
      }
      if (!schedule) throw apiError_('VALIDATION', 'Jadwal ledger tidak ditemukan.');
      var ledgerList = (ctx.current.ledger || []).concat(
        (ctx.changes.ledger && ctx.changes.ledger.upserts) || []
      );
      for (var li = 0; li < ledgerList.length; li++) {
        if (apiRecordId_(ledgerList[li]) === entryId) continue;
        if (String(ledgerList[li].bookingId || '') === String(entry.bookingId || '')) {
          throw apiError_('VALIDATION', 'Booking ini sudah punya ledger.');
        }
      }
      var payList = apiSyncMergeList_(ctx, 'payments');
      var paidPayment = false;
      for (var pp = 0; pp < payList.length; pp++) {
        if (String(payList[pp].bookingId || '') === String(entry.bookingId || '') &&
            String(payList[pp].status || '') === 'paid') {
          paidPayment = true;
          break;
        }
      }
      if (!paidPayment) {
        throw apiError_('VALIDATION', 'Ledger hanya boleh dibuat setelah pembayaran lunas.');
      }
      if (String(entry.status || '') !== 'ditahan') {
        throw apiError_('VALIDATION', 'Ledger baru harus berstatus ditahan.');
      }
      if (String(entry.scheduleId || '') !== String(booking.scheduleId || '') ||
          String(entry.agencyId || '') !== String(schedule.agencyId || '')) {
        throw apiError_('VALIDATION', 'Jadwal/agensi ledger tidak sesuai booking.');
      }
      if (String(entry.driverId || '') !== String(schedule.driverId || '')) {
        throw apiError_('VALIDATION', 'Pengemudi ledger tidak sesuai jadwal.');
      }
      if (apiNormalizeEmail_(entry.userEmail) !== apiNormalizeEmail_(booking.userEmail)) {
        throw apiError_('VALIDATION', 'Email ledger tidak sesuai booking.');
      }
      if (JSON.stringify(entry.seats || []) !== JSON.stringify(booking.seats || [])) {
        throw apiError_('VALIDATION', 'Kursi ledger tidak sesuai booking.');
      }
      var expected = apiSyncSplitFare_(
        ctx, schedule, (booking.seats || []).length,
        booking.discount || 0, booking.source || ''
      );
      ['ticket', 'service', 'fee', 'total'].forEach(function (field) {
        if (Math.abs(apiSyncNumber_(entry[field], 0) - apiSyncNumber_(expected[field], 0)) > 0.5) {
          throw apiError_('VALIDATION', 'Nominal ' + field + ' ledger tidak sesuai perhitungan.');
        }
      });
      if (Math.abs(apiSyncNumber_(entry.total, 0) - apiSyncNumber_(booking.total, 0)) > 0.5) {
        throw apiError_('VALIDATION', 'Total ledger tidak sesuai total booking.');
      }
      return;
    }

    if (ctx.role === 'superadmin') return;
    var changed = apiSyncChangedFields_(entry, old);
    var allowed = {
      status: 1, releasedAt: 1, paidOutAt: 1, voidedAt: 1, updatedAt: 1,
      scheduleId: 1, agencyId: 1, driverId: 1, seats: 1,
      ticket: 1, service: 1, fee: 1, total: 1, replacedFromScheduleId: 1
    };
    for (var c = 0; c < changed.length; c++) {
      if (!allowed[changed[c]]) {
        throw apiError_('FORBIDDEN', 'Field ledger "' + changed[c] + '" tidak boleh diubah.');
      }
    }
    var moved = changed.indexOf('scheduleId') >= 0 || changed.indexOf('agencyId') >= 0 ||
      changed.indexOf('driverId') >= 0 || changed.indexOf('seats') >= 0 ||
      changed.indexOf('ticket') >= 0 || changed.indexOf('service') >= 0 ||
      changed.indexOf('fee') >= 0 || changed.indexOf('total') >= 0 ||
      changed.indexOf('replacedFromScheduleId') >= 0;
    if (moved) {
      if (!booking || String(booking.maintenanceState || '') !== 'replaced' ||
          String(booking.scheduleId || '') !== String(entry.scheduleId || '')) {
        throw apiError_('FORBIDDEN', 'Ledger hanya boleh dipindah lewat maintenance.');
      }
      var targetSchedule = apiSyncFind_(ctx, 'schedules', entry.scheduleId);
      if (!targetSchedule ||
          String(entry.agencyId || '') !== String(targetSchedule.agencyId || '') ||
          String(entry.driverId || '') !== String(targetSchedule.driverId || '')) {
        throw apiError_('VALIDATION', 'Jadwal/agensi/pengemudi ledger tidak sesuai.');
      }
      if (JSON.stringify(entry.seats || []) !== JSON.stringify(booking.seats || [])) {
        throw apiError_('VALIDATION', 'Kursi ledger tidak sesuai booking.');
      }
      var movedExpected = apiSyncSplitFare_(
        ctx, targetSchedule, (booking.seats || []).length,
        booking.discount || 0, booking.source || ''
      );
      ['ticket', 'service', 'fee', 'total'].forEach(function (field) {
        if (Math.abs(apiSyncNumber_(entry[field], 0) - apiSyncNumber_(movedExpected[field], 0)) > 0.5) {
          throw apiError_('VALIDATION', 'Nominal ' + field + ' ledger tidak sesuai perhitungan.');
        }
      });
    }
    var oldStatus = String(old.status || '');
    var newStatus = String(entry.status || '');
    if (!apiSyncLedgerTransitionAllowed_(oldStatus, newStatus)) {
      throw apiError_('FORBIDDEN', 'Perubahan status ledger tidak diizinkan.');
    }
    if (newStatus === 'dicairkan' && oldStatus !== 'dicairkan') {
      throw apiError_('FORBIDDEN', 'Pencairan ledger hanya boleh dilakukan admin.');
    }
    if (changed.indexOf('paidOutAt') >= 0 && entry.paidOutAt) {
      throw apiError_('FORBIDDEN', 'Pencairan ledger hanya boleh dilakukan admin.');
    }
  }
  (target.upserts || []).forEach(function (rec) {
    check(rec, currentMap[apiRecordId_(rec)] || null);
  });
  (target.deletes || []).forEach(function (rawId) {
    var old = currentMap[String(rawId)];
    if (!old) throw apiError_('NOT_FOUND', 'Ledger tidak ditemukan: ' + rawId);
    if (ctx.role !== 'superadmin') {
      throw apiError_('FORBIDDEN', 'Ledger tidak boleh dihapus.');
    }
    check(old, old);
  });
}

/* --------------------------- vouchers ----------------------------- */

function apiSyncValidateVouchers_(ctx, target) {
  var currentMap = ctx.currentMap.vouchers || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (ctx.role === 'superadmin') return;
    if (ctx.role === 'agen') {
      if (!old) {
        if (String(rec.agencyId || '') !== String(ctx.user.agencyId || '')) {
          throw apiError_('FORBIDDEN', 'Voucher baru harus milik agensi Anda.');
        }
      } else if (!old.agencyId || String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
        /* Voucher global/agen lain bisa dipakai pada jadwal agen ini; saat
           pembatalan, agen hanya boleh mengembalikan jumlah pemakaian. */
        if (!apiSyncSameExcept_(rec, old, { used: 1 })) {
          throw apiError_('FORBIDDEN', 'Hanya jumlah pemakaian voucher ini yang boleh berubah.');
        }
        var globalAfter = Number(rec.used || 0) || 0;
        if (globalAfter < 0) {
          throw apiError_('VALIDATION', 'Jumlah pemakaian voucher tidak valid.');
        }
        if (globalAfter < (Number(old.used || 0) || 0)) {
          var globalRestore = apiSyncVoucherRestoreCount_(ctx, old.code || rec.code || id);
          if ((Number(old.used || 0) || 0) - globalAfter > globalRestore) {
            throw apiError_('FORBIDDEN', 'Pengurangan pemakaian voucher harus berasal dari pembatalan booking.');
          }
        }
        return;
      }
      if (old && String(rec.agencyId || '') !== String(old.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'agencyId voucher tidak boleh diubah.');
      }
      if (Number(rec.used || 0) < 0) {
        throw apiError_('VALIDATION', 'Jumlah pemakaian voucher tidak valid.');
      }
      return;
    }
    if (!old) throw apiError_('FORBIDDEN', 'Anda tidak boleh membuat voucher.');
    if (!apiSyncSameExcept_(rec, old, { used: 1 })) {
      throw apiError_('FORBIDDEN', 'Hanya jumlah pemakaian voucher yang boleh berubah.');
    }
    var after = Number(rec.used || 0) || 0;
    if (after < 0) {
      throw apiError_('VALIDATION', 'Jumlah pemakaian voucher tidak valid.');
    }
    if (after < (Number(old.used || 0) || 0)) {
      var restore = apiSyncVoucherRestoreCount_(ctx, old.code || rec.code || id);
      if ((Number(old.used || 0) || 0) - after > restore) {
        throw apiError_('FORBIDDEN', 'Pengurangan pemakaian voucher harus berasal dari pembatalan booking.');
      }
    }
    /* Satu pembatalan jadwal bisa mengembalikan beberapa pemakaian sekaligus,
       jadi selisih tidak dibatasi satu; field lain tetap tidak boleh berubah. */
    if (after > Number(old.used || 0) && old.quota != null && after > Number(old.quota || 0)) {
      throw apiError_('VALIDATION', 'Pemakaian voucher melebihi kuota.');
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var old = currentMap[String(rawId)];
    if (!old) throw apiError_('NOT_FOUND', 'Voucher tidak ditemukan: ' + rawId);
    if (ctx.role === 'superadmin') return;
    if (ctx.role !== 'agen' || String(old.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Anda tidak boleh menghapus voucher ini.');
    }
  });
}

/* ---------------------------- reviews ----------------------------- */

function apiSyncValidateReviews_(ctx, target) {
  var currentMap = ctx.currentMap.reviews || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (ctx.role === 'superadmin') return;
    if (ctx.role !== 'pelanggan') throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis ulasan.');
    if (old) throw apiError_('FORBIDDEN', 'Ulasan yang sudah ada tidak boleh diubah.');
    var agency = apiSyncFind_(ctx, 'agencies', rec.agencyId);
    if (!agency || String(agency.status || 'active') !== 'active') {
      throw apiError_('VALIDATION', 'Agensi ulasan tidak valid.');
    }
    var rating = Number(rec.rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      throw apiError_('VALIDATION', 'Rating ulasan harus 1-5.');
    }
  });
  if (target.deletes && target.deletes.length && ctx.role !== 'superadmin') {
    throw apiError_('FORBIDDEN', 'Anda tidak boleh menghapus ulasan.');
  }
}

/* ------------------------- notifications -------------------------- */

function apiSyncValidateNotifications_(ctx, target) {
  var currentMap = ctx.currentMap.notifications || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (ctx.role === 'superadmin') return;
    var to = apiNormalizeEmail_(rec.to);
    var selfEmail = apiNormalizeEmail_(ctx.user.email);
    if (!old) {
      /* Notifikasi baru hanya untuk diri sendiri; notifikasi staf/pelanggan
         lain dibuat oleh alur server atau terlihat dari data transaksi. */
      if (to !== selfEmail) {
        throw apiError_('FORBIDDEN', 'Anda hanya boleh membuat notifikasi untuk diri sendiri.');
      }
      return;
    }
    if (to !== selfEmail && to !== 'all') {
      throw apiError_('FORBIDDEN', 'Notifikasi ini bukan milik Anda.');
    }
    if (!apiSyncSameExcept_(rec, old, { read: 1 })) {
      throw apiError_('FORBIDDEN', 'Hanya status baca notifikasi yang boleh diubah.');
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var old = currentMap[String(rawId)];
    if (!old) throw apiError_('NOT_FOUND', 'Notifikasi tidak ditemukan: ' + rawId);
    if (ctx.role === 'superadmin') return;
    var to = apiNormalizeEmail_(old.to);
    if (to !== apiNormalizeEmail_(ctx.user.email)) {
      throw apiError_('FORBIDDEN', 'Anda hanya boleh menghapus notifikasi sendiri.');
    }
  });
}

/* ------------------------ support tickets ------------------------- */

function apiSyncSupportAccess_(ctx, ticket, old) {
  if (ctx.role === 'superadmin') return true;
  var email = apiNormalizeEmail_(ctx.user.email);
  if (ctx.role === 'pelanggan') {
    if (apiNormalizeEmail_(ticket.userEmail) !== email &&
        String(ticket.userId || '') !== String(ctx.user.id || '')) return false;
    if (old && apiNormalizeEmail_(old.userEmail) !== email &&
        String(old.userId || '') !== String(ctx.user.id || '')) return false;
    return true;
  }
  if (ctx.role === 'pengemudi') {
    if (apiNormalizeEmail_(ticket.userEmail) !== email) return false;
    if (old && apiNormalizeEmail_(old.userEmail) !== email) return false;
    return true;
  }
  if (ctx.role === 'agen') {
    if (String(ticket.agencyId || '') === String(ctx.user.agencyId || '')) return true;
    if (old && String(old.agencyId || '') === String(ctx.user.agencyId || '')) return true;
    var code = String(ticket.bookingCode || '');
    if (!code) return false;
    var bookings = apiSyncMergeList_(ctx, 'bookings');
    var schedules = apiSyncMergeList_(ctx, 'schedules');
    var scheduleMap = apiIndexById_(schedules);
    for (var i = 0; i < bookings.length; i++) {
      if (String(bookings[i].code || '') !== code) continue;
      var sc = scheduleMap[String(bookings[i].scheduleId || '')];
      if (sc && String(sc.agencyId || '') === String(ctx.user.agencyId || '')) return true;
    }
    return false;
  }
  return false;
}

function apiSyncTicketMessagesAppend_(oldMessages, newMessages, allowedFroms) {
  var before = Array.isArray(oldMessages) ? oldMessages : [];
  var after = Array.isArray(newMessages) ? newMessages : [];
  if (after.length < before.length) return false;
  for (var i = 0; i < before.length; i++) {
    if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) return false;
  }
  for (var j = before.length; j < after.length; j++) {
    var msg = after[j] || {};
    if (allowedFroms.indexOf(String(msg.from || '')) < 0) return false;
  }
  return true;
}

function apiSyncValidateSupportTickets_(ctx, target) {
  var currentMap = ctx.currentMap.supportTickets || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (!apiSyncSupportAccess_(ctx, rec, old)) {
      throw apiError_('FORBIDDEN', 'Tiket ini bukan milik Anda.');
    }
    if (ctx.role === 'superadmin') return;

    var selfEmail = apiNormalizeEmail_(ctx.user.email);
    if (!old) {
      /* Tiket baru harus dibuat atas nama akun yang sedang login. */
      if (apiNormalizeEmail_(rec.userEmail) !== selfEmail ||
          String(rec.userId || '') !== String(ctx.user.id || '')) {
        throw apiError_('FORBIDDEN', 'Tiket baru harus atas nama akun Anda.');
      }
      if (rec.isGuest) {
        throw apiError_('FORBIDDEN', 'Tiket guest tidak disinkronkan.');
      }
      if (String(rec.status || '') !== 'new') {
        throw apiError_('VALIDATION', 'Status tiket baru harus new.');
      }
      if (!apiSyncTicketMessagesAppend_([], rec.messages, ['user', 'system'])) {
        throw apiError_('FORBIDDEN', 'Pesan tiket baru tidak valid.');
      }
      if (ctx.role === 'pelanggan' && String(rec.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Tiket pelanggan tidak boleh menempel ke agensi.');
      }
      if ((ctx.role === 'agen' || ctx.role === 'pengemudi') &&
          String(rec.agencyId || '') !== String(ctx.user.agencyId || '')) {
        throw apiError_('FORBIDDEN', 'Tiket harus berada di agensi Anda.');
      }
      return;
    }

    var ownTicket = apiNormalizeEmail_(old.userEmail) === selfEmail;
    if (ctx.role === 'agen' && !ownTicket) {
      /* Agen boleh menanggapi tiket agensinya sebagai CS. */
      if (!apiSyncSameExcept_(rec, old, { messages: 1, status: 1, statusHistory: 1, updatedAt: 1 })) {
        throw apiError_('FORBIDDEN', 'Agen hanya boleh mengubah pesan/status tiket agensinya.');
      }
      if (['new', 'process', 'waiting', 'resolved'].indexOf(String(rec.status || '')) < 0) {
        throw apiError_('VALIDATION', 'Status tiket tidak valid.');
      }
      if (!apiSyncTicketMessagesAppend_(old.messages, rec.messages, ['cs', 'system'])) {
        throw apiError_('FORBIDDEN', 'Balasan agen harus berupa pesan CS.');
      }
      return;
    }

    if (!ownTicket) {
      throw apiError_('FORBIDDEN', 'Tiket ini bukan milik Anda.');
    }
    if (!apiSyncSameExcept_(rec, old, { messages: 1, status: 1, statusHistory: 1, updatedAt: 1 })) {
      throw apiError_('FORBIDDEN', 'Hanya pesan/status tiket yang boleh diubah.');
    }
    if (!apiSyncTicketMessagesAppend_(old.messages, rec.messages, ['user'])) {
      throw apiError_('FORBIDDEN', 'Pelanggan hanya boleh menambah pesan sendiri.');
    }
    var oldStatus = String(old.status || '');
    var newStatus = String(rec.status || '');
    if (newStatus !== oldStatus && !(oldStatus === 'waiting' && newStatus === 'process')) {
      throw apiError_('FORBIDDEN', 'Perubahan status tiket tidak diizinkan.');
    }
  });
  (target.deletes || []).forEach(function (rawId) {
    var old = currentMap[String(rawId)];
    if (!old) throw apiError_('NOT_FOUND', 'Tiket tidak ditemukan: ' + rawId);
    if (!apiSyncSupportAccess_(ctx, old, old)) {
      throw apiError_('FORBIDDEN', 'Tiket ini bukan milik Anda.');
    }
    if (ctx.role === 'pengemudi') throw apiError_('FORBIDDEN', 'Pengemudi tidak boleh menghapus tiket.');
  });
}

/* ------------------------- route requests ------------------------- */

function apiSyncValidateRouteRequests_(ctx, target) {
  var currentMap = ctx.currentMap.routeRequests || {};
  (target.upserts || []).forEach(function (rec) {
    var id = apiRecordId_(rec);
    var old = currentMap[id] || null;
    if (ctx.role === 'superadmin') return;
    if (ctx.role !== 'agen') throw apiError_('FORBIDDEN', 'Peran ini tidak boleh menulis usulan rute.');
    if (old) throw apiError_('FORBIDDEN', 'Usulan rute tidak boleh diubah agen.');
    if (String(rec.agencyId || '') !== String(ctx.user.agencyId || '')) {
      throw apiError_('FORBIDDEN', 'Usulan rute harus untuk agensi Anda.');
    }
    if (String(rec.status || 'pending') !== 'pending') {
      throw apiError_('VALIDATION', 'Status usulan rute baru harus pending.');
    }
  });
  if (target.deletes && target.deletes.length && ctx.role !== 'superadmin') {
    throw apiError_('FORBIDDEN', 'Agen tidak boleh menghapus usulan rute.');
  }
}

/* -------------------------- dispatcher ---------------------------- */

function apiSyncValidateCollection_(ctx, key, target) {
  switch (key) {
    case 'agencies': apiSyncValidateAgencies_(ctx, target); return;
    case 'routes': apiSyncValidateRoutes_(ctx, target); return;
    case 'vehicles': apiSyncValidateVehicles_(ctx, target); return;
    case 'drivers': apiSyncValidateDrivers_(ctx, target); return;
    case 'schedules': apiSyncValidateSchedules_(ctx, target); return;
    case 'maintenanceRequests': apiSyncValidateMaintenance_(ctx, target); return;
    case 'bookings': apiSyncValidateBookings_(ctx, target); return;
    case 'payments': apiSyncValidatePayments_(ctx, target); return;
    case 'ledger': apiSyncValidateLedger_(ctx, target); return;
    case 'vouchers': apiSyncValidateVouchers_(ctx, target); return;
    case 'reviews': apiSyncValidateReviews_(ctx, target); return;
    case 'notifications': apiSyncValidateNotifications_(ctx, target); return;
    case 'supportTickets': apiSyncValidateSupportTickets_(ctx, target); return;
    case 'routeRequests': apiSyncValidateRouteRequests_(ctx, target); return;
    default:
      if (ctx.role !== 'superadmin') {
        throw apiError_('FORBIDDEN', 'Peran tidak diizinkan menulis ' + key + '.');
      }
  }
}

/**
 * Validasi lintas koleksi: kursi pada jadwal yang tersentuh tidak boleh
 * dobel, dan tidak boleh menabrak blockedSeats/kursi nonaktif.
 */
function apiSyncCrossValidate_(ctx) {
  var touched = Object.keys(ctx.touchedSchedules);
  if (!touched.length) return;
  var schedules = apiSyncMergeList_(ctx, 'schedules');
  var vehicles = apiSyncMergeList_(ctx, 'vehicles');
  var bookings = apiSyncMergeList_(ctx, 'bookings');
  var scheduleMap = apiIndexById_(schedules);
  var vehicleMap = apiIndexById_(vehicles);
  var bySchedule = {};
  bookings.forEach(function (b) {
    var status = String((b && b.status) || '');
    if (['pending', 'paid', 'done'].indexOf(status) < 0) return;
    var sid = String((b && b.scheduleId) || '');
    if (!sid) return;
    if (!bySchedule[sid]) bySchedule[sid] = [];
    bySchedule[sid].push(b);
  });
  for (var i = 0; i < touched.length; i++) {
    var sid = touched[i];
    var schedule = scheduleMap[sid];
    if (!schedule) continue;
    if (String(schedule.status || '') === 'cancelled' ||
        String(schedule.tripStatus || '') === 'cancelled') continue;
    var taken = {};
    var blocked = Array.isArray(schedule.blockedSeats) ? schedule.blockedSeats : [];
    blocked.forEach(function (seat) { taken[String(seat)] = true; });
    var vehicle = vehicleMap[String(schedule.vehicleId || '')];
    var inactive = vehicle && Array.isArray(vehicle.inactiveSeats) ? vehicle.inactiveSeats : [];
    inactive.forEach(function (seat) { taken[String(seat)] = true; });
    var list = bySchedule[sid] || [];
    for (var b = 0; b < list.length; b++) {
      var seats = Array.isArray(list[b].seats) ? list[b].seats : [];
      for (var s = 0; s < seats.length; s++) {
        var seat = String(seats[s]);
        if (taken[seat]) {
          throw apiError_('SEAT_CONFLICT', 'Kursi ' + seat + ' pada jadwal ' + sid + ' sudah terpakai.');
        }
        taken[seat] = true;
      }
    }
  }
}



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
